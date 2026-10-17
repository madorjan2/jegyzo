// Ticket issuing + PDF + QR (FR-701..FR-709).
// Tickets are issued transactionally when the payment succeeds (BR-09).
// Codes are 12 chars from a crypto-random source (BR-30).
import { Injectable } from '@nestjs/common';
import { TicketStatus } from '@prisma/client';
import pdfkit from 'pdfkit';
import type PDFKit from 'pdfkit';
import * as QRCode from 'qrcode';
import { PrismaService } from '../db/prisma.service';
import { ApiError } from '../common/errors/api-error';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';  // no I/O/0/1 (BR-30)

function randomCode(len: number): string {
  const bytes = [...crypto.getRandomValues(new Uint8Array(len))];
  return bytes.map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}

@Injectable()
export class TicketsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Issues one Ticket per purchased ticket (quantities expand). */
  async issueTicketsForBooking(bookingId: number): Promise<number> {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: { items: true },
    });
    if (!booking) throw new ApiError('BOOKING_NOT_FOUND');
    if (booking.status !== 'FIZETVE') return 0;

    const existing = await this.prisma.ticket.count({ where: { bookingId } });
    let issued = 0;
    for (const it of booking.items) {
      for (let q = 0; q < it.quantity; q++) {
        let code: string;
        do {
          code = randomCode(12);
        } while ((await this.prisma.ticket.findUnique({ where: { code } })) !== null);  // collision-safe (E8-S2)
        await this.prisma.ticket.create({
          data: {
            bookingId, ticketTypeId: it.ticketTypeId, seatId: it.seatId ?? null,
            code, qrPayload: `JGY-TICKET:${code}`, status: TicketStatus.ERVENYES,
          },
        });
        issued++;
      }
    }
    return issued;
  }

  /** Renders a PDF ticket with the code and a QR payload (FR-703, FR-704). */
  async renderPdf(code: string): Promise<Buffer> {
    const ticket = await this.prisma.ticket.findUnique({
      where: { code },
      include: {
        booking: { include: { event: { include: { venue: true } } } },
        seat: { include: { row: { include: { section: true } } } },
        ticketType: { include: { section: true } },
      },
    });
    if (!ticket) throw new ApiError('TICKET_NOT_FOUND');

    const ev = ticket.booking.event;
    const venue = ev.venue;
    const qrPayload = ticket.qrPayload;
    const qrDataUrl = await QRCode.toDataURL(qrPayload, { margin: 1, width: 200 });

    const doc: PDFKit.PDFDocument = new pdfkit({ size: 'A4', margin: 50 });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

    doc.fontSize(22).text(ev.name, { align: 'left' });
    doc.moveDown(0.4);
    doc.fontSize(12).text(`Kezdés: ${ev.startsAt.toISOString().replace('T', ' ').slice(0, 16)}`);
    doc.text(`Helyszín: ${venue.name} (${venue.city}, ${venue.address})`);
    const seatLine = ticket.seat
      ? `${ticket.seat.row.section.name} / ${ticket.seat.row.label} sor / ${ticket.seat.label}`
      : `${ticket.ticketType.section.name} — állóhely`;
    doc.text(`Hely: ${seatLine}`);
    doc.text(`Ár: ${ticket.ticketType.price.toLocaleString('hu-HU')} Ft`);
    doc.moveDown();
    doc.fontSize(18).text(`Jegykód: ${ticket.code}`);
    doc.moveDown(0.6);
    // QR image
    const qrBase64 = qrDataUrl.replace(/^data:image\/png;base64,/, '');
    doc.image(Buffer.from(qrBase64, 'base64'), { fit: [180, 180] });
    doc.moveDown(0.6);
    doc.fontSize(10).fillColor('#666').text(`QR tartalom: ${qrPayload}`);

    doc.end();
    return await done;
  }

  /** Public ticket validity endpoint (FR-706). */
  async validate(code: string) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { code },
      include: { booking: { include: { event: true } } },
    });
    if (!ticket) throw new ApiError('TICKET_NOT_FOUND');
    if (ticket.status === 'VISSZAVONT') throw new ApiError('TICKET_REVOKED');
    const ev = ticket.booking.event;
    return {
      valid: true as const,
      event: { id: ev.id, name: ev.name, startsAt: ev.startsAt },
      ticketCode: ticket.code,
    };
  }
}
