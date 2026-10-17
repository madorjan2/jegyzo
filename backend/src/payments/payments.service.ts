// Payment initiation + processing (FR-601..FR-608).
// Handling:
//   ZAROLT → FIZETESRE_VAR (initiation)
//   mock PSP determinstic outcome (BR-13)
//   SIKERES: booking → FIZETVE, seats → ELADOTT, tickets issued, BEVETEL ledger
//   ELUTASITOTT / FELDOLGOZASI_HIBA: booking → ZAROLT; seats stay locked
//   IDOTULLEPES: booking stays FIZETESRE_VAR until the hold expires
//   Idempotency: same idempotencyKey → the first attempt's result (BR-08, NFR-03)
//   Append-only transaction log (FR-607)
import { Injectable } from '@nestjs/common';
import { PayStatus, BookingStatus, SeatStateEnum, CardBrand } from '@prisma/client';
import { ApiError } from '../common/errors/api-error';
import { PrismaService } from '../db/prisma.service';
import { MockPspService, luhnValid } from './mock-psp.service';
import { EmailService } from '../notifications/notifications.service';
import type { PspResult } from './mock-psp.service';

export interface CardDto {
  cardNumber: string;
  expiry: string;        // MM/YY or MM/YYYY
  cvc: string;
}

const BRAND_BY_PREFIX: [string, CardBrand][] = [
  ['4', CardBrand.VISA],
  ['51', CardBrand.MASTERCARD], ['52', CardBrand.MASTERCARD], ['53', CardBrand.MASTERCARD],
  ['54', CardBrand.MASTERCARD], ['55', CardBrand.MASTERCARD],
  ['34', CardBrand.AMEX], ['37', CardBrand.AMEX],
];

function detectBrand(normalized: string): CardBrand {
  for (const [prefix, brand] of BRAND_BY_PREFIX) {
    if (normalized.startsWith(prefix)) return brand;
  }
  return CardBrand.EGYEB;
}

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly psp: MockPspService,
    private readonly email: EmailService,
  ) {}

  /** Validates the card shape and throws catalog-coded errors. */
  private validateCard(dto: CardDto): { normalized: string; brand: CardBrand } {
    const normalized = dto.cardNumber.replace(/\s+/g, '');
    if (!luhnValid(normalized)) throw new ApiError('CARD_INVALID_NUMBER');
    const m = /^(\d{2})\s*\/\s*(\d{2}|\d{4})$/.exec(dto.expiry ?? '');
    if (!m) throw new ApiError('CARD_EXPIRED');
    const mm = Number(m[1]);
    let yy = Number(m[2]);
    if (yy < 100) yy += 2000;
    const now = new Date();
    const exp = new Date(yy, mm, 0, 23, 59, 59);  // end of expiry month
    if (exp.getTime() < now.getTime()) throw new ApiError('CARD_EXPIRED');
    const brand = detectBrand(normalized);
    const cvc = dto.cvc ?? '';
    const validLength = brand === CardBrand.AMEX ? 4 : 3;
    if (!(cvc.length === validLength && /^\d+$/.test(cvc))) throw new ApiError('CARD_CVC_INVALID');
    return { normalized, brand };
  }

  /** Initiates payment: ZAROLT → FIZETESRE_VAR. */
  async initiate(userId: number, role: string, bookingId: number, dto: CardDto) {
    const booking = await this.prisma.booking.findUnique({ where: { id: bookingId } });
    if (!booking) throw new ApiError('BOOKING_NOT_FOUND');
    if (booking.userId !== userId && role !== 'ADMIN') throw new ApiError('FORBIDDEN');
    if (booking.status === 'FIZETVE') throw new ApiError('PAYMENT_ALREADY_COMPLETED');
    if (!['ZAROLT', 'FIZETESRE_VAR'].includes(booking.status)) throw new ApiError('BOOKING_WRONG_STATE');

    const now = new Date();
    if (booking.holdExpiresAt.getTime() < now.getTime()) {
      // zár lejárat: felszabadul, LEJART
      await this.releaseSeats(bookingId, booking.eventId);
      await this.prisma.booking.update({ where: { id: bookingId }, data: { status: BookingStatus.LEJART } });
      throw new ApiError('BOOKING_EXPIRED');
    }

    this.validateCard(dto);  // throws CARD_INVALID_NUMBER / CARD_EXPIRED / CARD_CVC_INVALID

    if (booking.status === 'ZAROLT') {
      await this.prisma.booking.update({ where: { id: bookingId }, data: { status: BookingStatus.FIZETESRE_VAR } });
    }
    return { bookingId, status: 'FIZETESRE_VAR' };
  }

  async releaseSeats(bookingId: number, eventId: number) {
    await this.prisma.seatState.updateMany({
      where: { bookingId },
      data: { state: SeatStateEnum.SZABAD, bookingId: null, holdExpiresAt: null },
    });
  }

  /** Processes a payment attempt — the mock PSP decides the outcome. */
  async process(userId: number, role: string, bookingId: number, dto: CardDto, idempotencyKey?: string) {
    if (!idempotencyKey || !idempotencyKey.trim()) {
      throw new ApiError('VALIDATION_ERROR', { field: 'idempotencyKey', reason: 'required (BR-08)' });
    }

    const booking = await this.prisma.booking.findUnique({ where: { id: bookingId } });
    if (!booking) throw new ApiError('BOOKING_NOT_FOUND');
    if (booking.userId !== userId && role !== 'ADMIN') throw new ApiError('FORBIDDEN');

    // Idempotency short-circuit: same key → the first attempt's result (hit-identical)
    const byKey = await this.prisma.paymentTransaction.findFirst({
      where: { idempotencyKey },
    });
    if (byKey) {
      return { transactionId: byKey.id, status: byKey.status, pspReference: byKey.pspReference, errorCode: byKey.errorCode };
    }

    if (booking.status === 'FIZETVE') throw new ApiError('PAYMENT_ALREADY_COMPLETED');
    if (!['ZAROLT', 'FIZETESRE_VAR'].includes(booking.status)) throw new ApiError('BOOKING_WRONG_STATE');

    const now = new Date();
    if (booking.holdExpiresAt.getTime() < now.getTime()) {
      await this.releaseSeats(bookingId, booking.eventId);
      await this.prisma.booking.update({ where: { id: bookingId }, data: { status: BookingStatus.LEJART } });
      throw new ApiError('BOOKING_EXPIRED');
    }

    const { normalized, brand } = this.validateCard(dto);
    const result = this.psp.charge(normalized);
    const prevAttempts = await this.prisma.paymentTransaction.count({ where: { bookingId } });

    const statusMap = {
      SIKERES: PayStatus.SIKERES,
      ELUTASITOTT: PayStatus.ELUTASITOTT,
      IDOTULLEPES: PayStatus.IDOTULLEPES,
      FELDOLGOZASI_HIBA: PayStatus.FELDOLGOZASI_HIBA,
    } as const;
    const payStatus = statusMap[result.status];

    const transaction = await this.prisma.paymentTransaction.create({
      data: {
        bookingId,
        amount: booking.total,
        status: payStatus,
        cardLast4: normalized.slice(-4),
        cardBrand: brand,
        pspReference: result.pspReference,
        errorCode: result.errorCode,
        attemptNumber: prevAttempts + 1,
        idempotencyKey,
      },
    });

    if (payStatus === PayStatus.SIKERES) {
      await this.markPaid(bookingId);
    } else if (payStatus === PayStatus.ELUTASITOTT || payStatus === PayStatus.FELDOLGOZASI_HIBA) {
      await this.prisma.booking.update({ where: { id: bookingId }, data: { status: BookingStatus.ZAROLT } });
    }
    // IDOTULLEPES: booking stays FIZETESRE_VAR until the hold expires

    return { transactionId: transaction.id, status: transaction.status, pspReference: transaction.pspReference, errorCode: transaction.errorCode };
  }

  /** Issues tickets and records delivery; called after the payment lands. */
  private async markPaid(bookingId: number) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: { items: true },
    });
    if (!booking) throw new ApiError('BOOKING_NOT_FOUND');

    if (booking.status !== BookingStatus.FIZETVE) {
      await this.prisma.booking.update({
        where: { id: bookingId },
        data: { status: BookingStatus.FIZETVE, paidAt: new Date() },
      });

      // seats → ELADOTT
      const itemSeatIds = booking.items.filter((i) => i.seatId !== null).map((i) => i.seatId!);
      if (itemSeatIds.length > 0) {
        await this.prisma.seatState.updateMany({
          where: { eventId: booking.eventId, seatId: { in: itemSeatIds } },
          data: { state: SeatStateEnum.ELADOTT, holdExpiresAt: null },
        });
      }

      for (const it of booking.items) {
        for (let q = 0; q < it.quantity; q++) {
          let code: string;
          do {
            const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
            const random = [...crypto.getRandomValues(new Uint8Array(10))].map((b) => b % chars.length);
            code = 'JG' + random.map((n) => chars[n]).join('');
          } while ((await this.prisma.ticket.findUnique({ where: { code } })) !== null);
          await this.prisma.ticket.create({
            data: {
              bookingId, ticketTypeId: it.ticketTypeId, seatId: it.seatId ?? null,
              code, qrPayload: `JGY-TICKET:${code}`, status: 'ERVENYES',
            },
          });
        }
      }

      // BEVETEL ledger entry — once
      const existingLedger = await this.prisma.ledgerEntry.count({
        where: { bookingId, type: 'BEVETEL' },
      });
      if (existingLedger === 0) {
        await this.prisma.ledgerEntry.create({
          data: { type: 'BEVETEL', bookingId, eventId: booking.eventId, amount: booking.total },
        });
      }
    }

    // FR-707: ticket mail is recorded in EmailNotification with
    // JEGY_KIIALLITVA; language comes from the recipient's User.locale.
    const user = await this.prisma.user.findUnique({ where: { id: booking.userId } });
    if (user) {
      const tickets = await this.prisma.ticket.findMany({ where: { bookingId } });
      await this.email.sendTicketMail(
        user.email,
        (await this.prisma.event.findUnique({ where: { id: booking.eventId } }))?.name ?? '',
        tickets.map((t) => t.code),
        `/tickets/${tickets[0]?.code ?? ''}/pdf`,
      );
    }
  }
}
