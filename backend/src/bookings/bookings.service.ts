// Booking creation (FR-501..FR-510) — seat holds, totals, concurrency.
// Rules (docs/04 1.1 + 1.3):
//   BR-01 a seat is bounded to at most one non-expired, non-cancelled booking
//   BR-02 hold = creation + BOOKING_HOLD_MINUTES (default 10)
//   BR-03 sold+held ≤ ticket-type capacity (exact reach allowed)
//   BR-04 sales limit: maxPerUser counts ZAROLT + FIZETESRE_VAR + FIZETVE items
//   BR-07 service fee = SERVICE_FEE_PER_TICKET × total tickets
//   BR-29 1–20 tickets per booking
//   BR-20 booking visibility/modification reserved for the owner or an ADMIN.
import { Injectable } from '@nestjs/common';
import { Prisma, BookingStatus, SeatStateEnum } from '@prisma/client';
import { PrismaService } from '../db/prisma.service';
import { ApiError } from '../common/errors/api-error';

export interface SeatBookingItem {
  seatId: number;
  ticketTypeId: number;
}

export interface StandingBookingItem {
  ticketTypeId: number;
  quantity: number;
}

export type BookingItemInput = SeatBookingItem | StandingBookingItem;

function isStanding(it: BookingItemInput): it is StandingBookingItem {
  return typeof (it as StandingBookingItem).quantity === 'number';
}

@Injectable()
export class BookingsService {
  constructor(private readonly prisma: PrismaService) {}

  private async nextCode(year: number): Promise<string> {
    // JGY-<year>-000001 serial per year
    const count = await this.prisma.booking.count();
    return `JGY-${year}-${String(count + 1).padStart(6, '0')}`;
  }

  private holdAt(): Date {
    const minutes = Number(process.env.BOOKING_HOLD_MINUTES ?? 10);
    return new Date(Date.now() + minutes * 60_000);
  }

  /** Creates a booking with seat or standing items inside one transaction. */
  async create(userId: number, eventId: number, items: BookingItemInput[]) {
    if (!Array.isArray(items)) throw new ApiError('BOOKING_EMPTY');

    // 1..20 ticket limit (BR-29)
    const totalQty = items.reduce((sum, it) => sum + (isStanding(it) ? it.quantity : 1), 0);
    if (items.length === 0 || totalQty === 0) throw new ApiError('BOOKING_EMPTY');
    if (totalQty > 20) {
      throw new ApiError('BOOKING_TOO_MANY_TICKETS');
    }

    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event) throw new ApiError('EVENT_NOT_FOUND');
    if (event.status === 'LEMONDVA') throw new ApiError('EVENT_CANCELLED');
    if (event.status !== 'PUBLIKALT') {
      throw new ApiError('EVENT_NOT_ON_SALE');
    }
    const now = new Date();
    if (event.endsAt.getTime() < now.getTime()) throw new ApiError('EVENT_NOT_ON_SALE');

    const outcomes = await this.prisma.$transaction(async (tx) => {
      let subtotal = 0;
      const itemRows: { ticketTypeId: number; seatId: number | null; quantity: number; unitPrice: number; lineTotal: number }[] = [];

      for (const it of items) {
        if (isStanding(it)) {
          if (!Number.isInteger(it.quantity) || it.quantity < 1) {
            throw new ApiError('VALIDATION_ERROR', { field: 'quantity', reason: 'must be ≥ 1' });
          }
          const tt = await tx.ticketType.findUnique({ where: { id: it.ticketTypeId } });
          if (!tt || tt.eventId !== eventId) throw new ApiError('VALIDATION_ERROR', { field: 'ticketTypeId', reason: 'unknown ticket type for this event' });
          if (!tt.isActive) throw new ApiError('TICKET_TYPE_INACTIVE');

          // BR-03: sold + held ≤ capacity (exactly reaching is allowed)
          if (tt.capacity !== null) {
            const [paid, held] = await Promise.all([
              tx.bookingItem.aggregate({ _sum: { quantity: true }, where: { ticketTypeId: tt.id, booking: { status: { in: ['FIZETVE'] } } } }),
              tx.bookingItem.aggregate({ _sum: { quantity: true }, where: { ticketTypeId: tt.id, booking: { status: { in: ['FIZETESRE_VAR', 'ZAROLT'] }, holdExpiresAt: { gt: now } } } }),
            ]);
            const used = (paid._sum.quantity ?? 0) + (held._sum.quantity ?? 0);
            if (used + it.quantity > (tt.capacity ?? 0)) {
              throw new ApiError('CAPACITY_EXCEEDED', { ticketTypeId: tt.id, capacity: tt.capacity, used, requested: it.quantity });
            }
          }
          subtotal += tt.price * it.quantity;
          itemRows.push({ ticketTypeId: tt.id, seatId: null, quantity: it.quantity, unitPrice: tt.price, lineTotal: tt.price * it.quantity });
        } else {
          const seat = await tx.seat.findUnique({ where: { id: it.seatId } });
          if (!seat) throw new ApiError('SEAT_NOT_FOUND');
          const row = await tx.row.findUnique({ where: { id: seat.rowId } });
          const section = await tx.section.findUnique({ where: { id: row!.sectionId } });
          if (!section || section.venueId !== event.venueId) {
            throw new ApiError('SEAT_NOT_IN_EVENT');
          }

          // BR-28: a seated ticket's price is the ticket type of the seat's
          // section. The request must reference that ticket type.
          const tt = await tx.ticketType.findFirst({ where: { eventId, sectionId: section.id } });
          if (!tt) throw new ApiError('TICKET_TYPE_INACTIVE', { sectionId: section.id });
          if (!tt.isActive) throw new ApiError('TICKET_TYPE_INACTIVE');
          if (it.ticketTypeId !== tt.id) {
            throw new ApiError('VALIDATION_ERROR', { field: 'items.ticketTypeId', reason: 'must match the seat section ticket type' });
          }

          // BR-01: seat bounded to at most one non-expired/non-cancelled booking
          const existing = await tx.seatState.findUnique({
            where: { eventId_seatId: { eventId, seatId: seat.id } },
          });
          if (existing && (existing.state === 'ZAROLT' || existing.state === 'ELADOTT')) {
            throw new ApiError(existing.state === 'ELADOTT' ? 'SEAT_NOT_AVAILABLE' : 'SEAT_TAKEN', { seatId: seat.id });
          }

          subtotal += tt.price;
          itemRows.push({ ticketTypeId: tt.id, seatId: seat.id, quantity: 1, unitPrice: tt.price, lineTotal: tt.price });
        }
      }

      // BR-04: per-user sales limit (ZAROLT + FIZETESRE_VAR + FIZETVE count; LEJART/LEMONDVA don't)
      for (const it of itemRows) {
        const tt = await this.prisma.ticketType.findUnique({ where: { id: it.ticketTypeId } });
        const ongoingTickets = await tx.bookingItem.aggregate({
          _sum: { quantity: true },
          where: { booking: { userId, eventId, status: { in: ['ZAROLT', 'FIZETESRE_VAR', 'FIZETVE'] } }, ticketTypeId: it.ticketTypeId },
        }).then((r) => r._sum.quantity ?? 0);
        if (ongoingTickets + it.quantity > (tt?.maxPerUser ?? 8)) {
          throw new ApiError('TICKET_LIMIT_EXCEEDED', { ticketTypeId: it.ticketTypeId, maxPerUser: tt?.maxPerUser ?? 8 });
        }
      }

      const serviceFee = Number(process.env.SERVICE_FEE_PER_TICKET ?? 250) * totalQty;
      const code = await this.nextCode(new Date().getFullYear());
      const booking = await tx.booking.create({
        data: {
          code, userId, eventId,
          status: BookingStatus.ZAROLT,
          subtotal, serviceFee, total: subtotal + serviceFee,
          currency: 'HUF',
          holdExpiresAt: this.holdAt(),
        },
      });
      for (const row of itemRows) {
        await tx.bookingItem.create({
          data: { bookingId: booking.id, ticketTypeId: row.ticketTypeId, seatId: row.seatId, quantity: row.quantity, unitPrice: row.unitPrice, lineTotal: row.lineTotal },
        });
        if (row.seatId !== null) {
          await tx.seatState.upsert({
            where: { eventId_seatId: { eventId, seatId: row.seatId } },
            create: { eventId, seatId: row.seatId, state: SeatStateEnum.ZAROLT, bookingId: booking.id, holdExpiresAt: booking.holdExpiresAt },
            update: { state: SeatStateEnum.ZAROLT, bookingId: booking.id, holdExpiresAt: booking.holdExpiresAt },
          });
        }
      }
      return { booking, items: itemRows };
    });

    return this.toPublic(outcomes.booking.id, userId, 'VASARLO');
  }

  /** Cancels a pending (ZAROLT or FIZETESRE_VAR) booking, releasing its seats. */
  async cancel(userId: number, role: string, bookingId: number) {
    const booking = await this.prisma.booking.findUnique({ where: { id: bookingId } });
    if (!booking) throw new ApiError('BOOKING_NOT_FOUND');
    if (booking.userId !== userId && role !== 'ADMIN') throw new ApiError('FORBIDDEN');
    if (!['ZAROLT', 'FIZETESRE_VAR'].includes(booking.status)) throw new ApiError('BOOKING_WRONG_STATE');

    await this.prisma.$transaction(async (tx) => {
      await tx.booking.update({
        where: { id: bookingId },
        data: { status: BookingStatus.LEMONDVA, canceledAt: new Date(), holdExpiresAt: new Date() },
      });
      const items = await tx.bookingItem.findMany({ where: { bookingId } });
      for (const item of items) {
        if (item.seatId !== null) {
          await tx.seatState.updateMany({
            where: { eventId: booking.eventId, seatId: item.seatId, bookingId },
            data: { state: SeatStateEnum.SZABAD, bookingId: null, holdExpiresAt: null },
          });
        }
      }
    });
    return this.toPublic(bookingId, userId, role);
  }

  /** Booking detail: owner or ADMIN. */
  async detail(userId: number, role: string, bookingId: number) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        items: { include: { ticketType: { include: { section: true } }, seat: true } },
        tickets: true,
      },
    });
    if (!booking) throw new ApiError('BOOKING_NOT_FOUND');
    if (booking.userId !== userId && role !== 'ADMIN') throw new ApiError('FORBIDDEN');

    return {
      ...booking,
      items: booking.items.map((it) => ({
        id: it.id, ticketTypeId: it.ticketTypeId, ticketTypeName: it.ticketType.name,
        seatId: it.seatId, seatLabel: it.seat?.label ?? null,
        quantity: it.quantity, unitPrice: it.unitPrice, lineTotal: it.lineTotal,
      })),
      tickets: booking.tickets.map((t) => ({ id: t.id, code: t.code, status: t.status })),
    };
  }

  async listOwn(userId: number) {
    const rows = await this.prisma.booking.findMany({
      where: { userId },
      include: { items: { include: { ticketType: true, seat: true } }, tickets: true, event: { include: { venue: true } } },
      orderBy: { id: 'desc' },
    });
    return rows.map((b) => ({
      id: b.id, code: b.code, status: b.status, total: b.total,
      createdAt: b.createdAt, holdExpiresAt: b.holdExpiresAt,
      event: { id: b.event.id, name: b.event.name, startsAt: b.event.startsAt, venue: b.event.venue.name },
      items: b.items.map((it) => ({
        id: it.id, ticketTypeId: it.ticketTypeId, ticketTypeName: it.ticketType.name,
        seatId: it.seatId, seatLabel: it.seat?.label ?? null, quantity: it.quantity, lineTotal: it.lineTotal,
      })),
      tickets: b.tickets.map((t) => ({ id: t.id, code: t.code, status: t.status })),
    }));
  }

  private async toPublic(bookingId: number, userId: number, role: string) {
    return this.detail(userId, role, bookingId);
  }
}
