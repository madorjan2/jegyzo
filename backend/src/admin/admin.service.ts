// Admin backoffice (FR-801..FR-814). All access is server-side enforced:
// organizer (SZERVEZO) operates only on its own events; ADMIN everywhere.
import { Injectable } from '@nestjs/common';
import { Prisma, BookingStatus, EventStatus, SeatStateEnum, TicketStatus, UserRole } from '@prisma/client';
import { PrismaService } from '../db/prisma.service';
import { ApiError } from '../common/errors/api-error';
import { EmailService } from '../notifications/notifications.service';

const EDITABLE_STATUSES: EventStatus[] = ['PISZKOZAT', 'PUBLIKALT', 'ERTEKESITES_SZUNETELT'];
const EVENT_STATUSES: EventStatus[] = ['PISZKOZAT', 'PUBLIKALT', 'ERTEKESITES_SZUNETELT', 'LEZAJLT', 'LEMONDVA'];
const BOOKING_STATUSES: BookingStatus[] = ['ZAROLT', 'FIZETESRE_VAR', 'FIZETVE', 'LEMONDVA', 'LEJART', 'VISSZATERITVE'];

const MIN_DURATION = 30;
const MAX_DURATION = 600;
const CATEGORIES = ['KONCERT', 'SZINHAZ', 'SPORT', 'FESZTIVAL', 'EGYEB'];
const ROLES = ['VASARLO', 'SZERVEZO', 'ADMIN'];

function isDate(v: unknown): v is string {
  return typeof v === 'string' && !Number.isNaN(Date.parse(v));
}

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
  ) {}

  /** Central organizer/ADMIN ownership guard (FR-813, JGY-87). */
  private assertCanManage(
    userId: number,
    role: string,
    event: { organizerUserId: number },
  ): void {
    if (role === 'ADMIN') return;
    if (role === 'SZERVEZO' && event.organizerUserId === userId) return;
    throw new ApiError('FORBIDDEN');
  }

  // --------------------------------------------------------------- JGY-75
  async createEvent(
    userId: number,
    role: string,
    dto: {
      name?: string; category?: string; venueId?: number; startsAt?: string;
      durationMinutes?: number; doorsOpenAt?: string; description?: string;
      posterUrl?: string; salesStartAt?: string; salesEndAt?: string;
    },
  ) {
    if (!['SZERVEZO', 'ADMIN'].includes(role)) throw new ApiError('FORBIDDEN');

    const name = dto.name;
    if (typeof name !== 'string' || name.trim().length === 0 || name.length > 100) {
      throw new ApiError('VALIDATION_ERROR', { field: 'name', reason: 'non-empty string ≤ 100 chars' });
    }
    if (typeof dto.category !== 'string' || !CATEGORIES.includes(dto.category)) {
      throw new ApiError('VALIDATION_ERROR', { field: 'category', reason: `one of ${CATEGORIES.join(',')}` });
    }
    if (typeof dto.venueId !== 'number' || !Number.isInteger(dto.venueId) || dto.venueId <= 0) {
      throw new ApiError('VALIDATION_ERROR', { field: 'venueId', reason: 'positive integer' });
    }
    if (!isDate(dto.startsAt)) throw new ApiError('VALIDATION_ERROR', { field: 'startsAt', reason: 'ISO datetime' });
    if (typeof dto.durationMinutes !== 'number' || !Number.isInteger(dto.durationMinutes) ||
        dto.durationMinutes < MIN_DURATION || dto.durationMinutes > MAX_DURATION) {
      throw new ApiError('VALIDATION_ERROR', { field: 'durationMinutes', reason: `${MIN_DURATION}–${MAX_DURATION} minutes` });
    }
    if (typeof dto.description !== 'string' || dto.description.length < 50) {
      throw new ApiError('VALIDATION_ERROR', { field: 'description', reason: 'at least 50 characters' });
    }
    if (dto.posterUrl !== undefined && dto.posterUrl !== null && typeof dto.posterUrl !== 'string') {
      throw new ApiError('VALIDATION_ERROR', { field: 'posterUrl', reason: 'URL string or null' });
    }

    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(startsAt.getTime() + dto.durationMinutes * 60_000);

    // Sales window (BR-23): salesStartAt < salesEndAt ≤ startsAt.
    let salesStartAt = this.defaultSalesStart(startsAt);
    let salesEndAt = startsAt;
    if (dto.salesStartAt !== undefined || dto.salesEndAt !== undefined) {
      if (!isDate(dto.salesStartAt) || !isDate(dto.salesEndAt)) {
        throw new ApiError('VALIDATION_ERROR', { field: 'salesStartAt/salesEndAt', reason: 'both ISO datetimes required' });
      }
      salesStartAt = new Date(dto.salesStartAt!);
      salesEndAt = new Date(dto.salesEndAt!);
      if (salesStartAt.getTime() >= salesEndAt.getTime() || salesEndAt.getTime() > startsAt.getTime()) {
        throw new ApiError('VALIDATION_ERROR', { field: 'salesStartAt/salesEndAt', reason: 'BR-23: salesStartAt < salesEndAt ≤ startsAt' });
      }
    }

    const venue = await this.prisma.venue.findUnique({ where: { id: dto.venueId } });
    if (!venue) throw new ApiError('VALIDATION_ERROR', { field: 'venueId', reason: 'venue does not exist' });
    if (!venue.isActive) throw new ApiError('VENUE_INACTIVE');

    const created = await this.prisma.event.create({
      data: {
        name,
        category: dto.category!,
        venueId: dto.venueId!,
        organizerUserId: userId,   // creator is always the initial organizer (JGY-75)
        startsAt,
        durationMinutes: dto.durationMinutes!,
        endsAt,
        doorsOpenAt: dto.doorsOpenAt ? new Date(dto.doorsOpenAt) : null,
        description: dto.description!,
        posterUrl: dto.posterUrl ?? null,
        status: EventStatus.PISZKOZAT,
        salesStartAt,
        salesEndAt,
      },
    });
    return this.eventDetail(created.id);
  }

  private defaultSalesStart(startsAt: Date): Date {
    return new Date(startsAt.getTime() - 30 * 86_400_000);  // 30 days before
  }

  // --------------------------------------------------------------- JGY-76
  async updateEvent(
    userId: number,
    role: string,
    eventId: number,
    dto: {
      name?: string; category?: string; description?: string; posterUrl?: string | null;
      startsAt?: string; durationMinutes?: number; doorsOpenAt?: string | null;
      salesStartAt?: string; salesEndAt?: string;
    },
  ) {
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event) throw new ApiError('EVENT_NOT_FOUND');
    this.assertCanManage(userId, role, event);

    // BR-11: LEZAJLT / LEMONDVA cannot be modified
    if (!EDITABLE_STATUSES.includes(event.status)) throw new ApiError('EVENT_INVALID_STATE');

    const data: Prisma.EventUpdateInput = {};

    if (dto.name !== undefined) {
      if (typeof dto.name !== 'string' || dto.name.trim().length === 0 || dto.name.length > 100) {
        throw new ApiError('VALIDATION_ERROR', { field: 'name', reason: 'non-empty string ≤ 100 chars' });
      }
      data.name = dto.name;
    }
    if (dto.category !== undefined) {
      if (!CATEGORIES.includes(dto.category)) {
        throw new ApiError('VALIDATION_ERROR', { field: 'category', reason: `one of ${CATEGORIES.join(',')}` });
      }
      data.category = dto.category;
    }
    if (dto.description !== undefined) {
      if (typeof dto.description !== 'string' || dto.description.length < 50 || dto.description.length > 4000) {
        throw new ApiError('VALIDATION_ERROR', { field: 'description', reason: '50–4000 characters' });
      }
      data.description = dto.description;
    }
    if (dto.posterUrl !== undefined) data.posterUrl = dto.posterUrl;
    if (dto.doorsOpenAt !== undefined) data.doorsOpenAt = dto.doorsOpenAt === null ? null : new Date(dto.doorsOpenAt);

    let startsAt = event.startsAt;
    if (dto.startsAt !== undefined) {
      if (!isDate(dto.startsAt)) throw new ApiError('VALIDATION_ERROR', { field: 'startsAt', reason: 'ISO datetime' });
      startsAt = new Date(dto.startsAt);
      data.startsAt = startsAt;
    }
    let durationMinutes = event.durationMinutes;
    if (dto.durationMinutes !== undefined) {
      if (typeof dto.durationMinutes !== 'number' || !Number.isInteger(dto.durationMinutes) ||
          dto.durationMinutes < MIN_DURATION || dto.durationMinutes > MAX_DURATION) {
        throw new ApiError('VALIDATION_ERROR', { field: 'durationMinutes', reason: `${MIN_DURATION}–${MAX_DURATION} minutes` });
      }
      durationMinutes = dto.durationMinutes;
      data.durationMinutes = durationMinutes;
    }
    if (dto.startsAt !== undefined || dto.durationMinutes !== undefined) {
      data.endsAt = new Date(startsAt.getTime() + durationMinutes * 60_000);
    }

    // BR-23: salesStartAt < salesEndAt ≤ startsAt (merged with existing values)
    let salesStartAt = event.salesStartAt;
    let salesEndAt = event.salesEndAt;
    if (dto.salesStartAt !== undefined) {
      if (!isDate(dto.salesStartAt)) throw new ApiError('VALIDATION_ERROR', { field: 'salesStartAt', reason: 'ISO datetime' });
      salesStartAt = new Date(dto.salesStartAt);
      data.salesStartAt = salesStartAt;
    }
    if (dto.salesEndAt !== undefined) {
      if (!isDate(dto.salesEndAt)) throw new ApiError('VALIDATION_ERROR', { field: 'salesEndAt', reason: 'ISO datetime' });
      salesEndAt = new Date(dto.salesEndAt);
      data.salesEndAt = salesEndAt;
    }
    if (dto.salesStartAt !== undefined || dto.salesEndAt !== undefined) {
      if (salesStartAt.getTime() >= salesEndAt.getTime() || salesEndAt.getTime() > startsAt.getTime()) {
        throw new ApiError('VALIDATION_ERROR', { field: 'salesStartAt/salesEndAt', reason: 'BR-23: salesStartAt < salesEndAt ≤ startsAt' });
      }
    }

    await this.prisma.event.update({ where: { id: eventId }, data });
    return this.eventDetail(eventId);
  }

  // --------------------------------------------------------------- JGY-77
  async publishEvent(userId: number, role: string, eventId: number) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      include: { venue: true, ticketTypes: true },
    });
    if (!event) throw new ApiError('EVENT_NOT_FOUND');
    this.assertCanManage(userId, role, event);
    if (event.status !== EventStatus.PISZKOZAT) throw new ApiError('EVENT_INVALID_STATE');

    // BR-19 all-conditions check, single server-side evaluation (a single transaction).
    if (!event.venue.isActive) throw new ApiError('EVENT_PUBLISH_VALIDATION_FAILED', { reason: 'venue inactive (BR-19b)' });

    const activeTts = event.ticketTypes.filter((t) => t.isActive);
    if (activeTts.length === 0) throw new ApiError('EVENT_PUBLISH_VALIDATION_FAILED', { reason: 'no active ticket type (BR-19a)' });

    if (event.startsAt.getTime() <= Date.now()) {
      throw new ApiError('EVENT_PUBLISH_VALIDATION_FAILED', { reason: 'startsAt must be in the future (BR-19c/BR-11)' });
    }

    // BR-23: salesStartAt < salesEndAt ≤ startsAt
    if (event.salesStartAt.getTime() >= event.salesEndAt.getTime() ||
        event.salesEndAt.getTime() > event.startsAt.getTime()) {
      throw new ApiError('EVENT_PUBLISH_VALIDATION_FAILED', { reason: 'invalid sales window (BR-23)' });
    }

    if (typeof event.description !== 'string' || event.description.length < 50) {
      throw new ApiError('EVENT_PUBLISH_VALIDATION_FAILED', { reason: 'description too short (BR-19e)' });
    }

    // The sales window also has to start at or before now for ticket sales to
    // be open; a later start is still a valid configuration, the event simply
    // is not on sale yet (FR-210/BR-05 handles the intersection).
    const now = new Date();
    const published = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.event.update({
        where: { id: eventId },
        data: { status: EventStatus.PUBLIKALT, publishedAt: now },
      });
      // Seated sections get their seat states created as SZABAD at publish time.
      const sections = await tx.section.findMany({
        where: { venueId: event.venueId, kind: 'ULOHELYES' },
        include: { rows: { include: { seats: true } } },
      });
      const seatIds = sections.flatMap((s) => s.rows.flatMap((r) => r.seats.map((x) => x.id)));
      if (seatIds.length > 0) {
        // Idempotent: re-publishing is blocked by the state machine, but a
        // manual retry after a failed transaction can call this again.
        await tx.seatState.createMany({
          data: seatIds.map((seatId) => ({ eventId, seatId, state: SeatStateEnum.SZABAD })),
          skipDuplicates: true,
        });
      }
      return updated;
    });
    return this.eventDetail(published.id);
  }

  // --------------------------------------------------------------- JGY-78
  async pauseSales(userId: number, role: string, eventId: number) {
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event) throw new ApiError('EVENT_NOT_FOUND');
    this.assertCanManage(userId, role, event);
    if (event.status !== EventStatus.PUBLIKALT && event.status !== EventStatus.ERTEKESITES_SZUNETELT) {
      throw new ApiError('EVENT_INVALID_STATE');
    }
    await this.prisma.event.update({ where: { id: eventId }, data: { status: EventStatus.ERTEKESITES_SZUNETELT } });
    return this.eventDetail(eventId);
  }

  async resumeSales(userId: number, role: string, eventId: number) {
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event) throw new ApiError('EVENT_NOT_FOUND');
    this.assertCanManage(userId, role, event);
    if (event.status !== EventStatus.ERTEKESITES_SZUNETELT) throw new ApiError('EVENT_INVALID_STATE');
    await this.prisma.event.update({ where: { id: eventId }, data: { status: EventStatus.PUBLIKALT } });
    return this.eventDetail(eventId);
  }

  // --------------------------------------------------------------- JGY-79
  async deleteEvent(userId: number, role: string, eventId: number) {
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event) throw new ApiError('EVENT_NOT_FOUND');
    this.assertCanManage(userId, role, event);
    if (event.status !== EventStatus.PISZKOZAT) throw new ApiError('EVENT_INVALID_STATE');

    await this.prisma.$transaction([
      this.prisma.ticketType.deleteMany({ where: { eventId } }),
      this.prisma.seatState.deleteMany({ where: { eventId } }),
      this.prisma.event.delete({ where: { id: eventId } }),
    ]);
    return { ok: true, deletedId: eventId };
  }

  // --------------------------------------------------------------- JGY-80
  async listEvents(
    role: string,
    organizerUserIdFilter: number | undefined,
    filters: {
      status?: string; venueId?: number; organizerUserId?: number;
      dateFrom?: string; dateTo?: string;
    },
  ) {
    const where: Prisma.EventWhereInput = {};
    // BR-20: SZERVEZO sees only its own events, ADMIN sees everything.
    if (role === 'SZERVEZO') {
      where.organizerUserId = organizerUserIdFilter ?? -1;
    } else {
      if (filters.organizerUserId !== undefined) where.organizerUserId = filters.organizerUserId;
    }
    if (filters.status !== undefined) {
      const st = filters.status as EventStatus;
      if (!EVENT_STATUSES.includes(st)) {
        throw new ApiError('VALIDATION_ERROR', { field: 'status', reason: `one of ${EVENT_STATUSES.join(',')}` });
      }
      where.status = st;
    }
    if (filters.venueId !== undefined) {
      if (!Number.isInteger(filters.venueId) || filters.venueId <= 0) {
        throw new ApiError('VALIDATION_ERROR', { field: 'venueId', reason: 'positive integer' });
      }
      where.venueId = filters.venueId;
    }
    if (filters.dateFrom !== undefined || filters.dateTo !== undefined) {
      const from = filters.dateFrom ? new Date(filters.dateFrom) : undefined;
      const to = filters.dateTo ? new Date(filters.dateTo) : undefined;
      if ((filters.dateFrom && !isDate(filters.dateFrom)) || (filters.dateTo && !isDate(filters.dateTo))) {
        throw new ApiError('VALIDATION_ERROR', { field: 'dateFrom/dateTo', reason: 'ISO datetime' });
      }
      where.startsAt = {
        ...(from ? { gte: from } : {}),
        ...(to ? { lte: to } : {}),
      };
    }
    const rows = await this.prisma.event.findMany({
      where,
      include: { venue: true, ticketTypes: true },
      orderBy: { id: 'asc' },
    });
    // LEZAJLT status shown as stored; BR-27 auto-transition happens in the
    // public catalogue. All events appear here (FR-806).
    return rows.map((e) => ({
      id: e.id, name: e.name, category: e.category, status: e.status,
      venueId: e.venueId, venueName: e.venue.name,
      organizerUserId: e.organizerUserId,
      startsAt: e.startsAt, endsAt: e.endsAt,
      durationMinutes: e.durationMinutes,
      salesStartAt: e.salesStartAt, salesEndAt: e.salesEndAt,
      publishedAt: e.publishedAt,
      description: e.description, posterUrl: e.posterUrl, doorsOpenAt: e.doorsOpenAt,
      ticketTypes: e.ticketTypes.map((t) => ({
        id: t.id, name: t.name, price: t.price, capacity: t.capacity,
        maxPerUser: t.maxPerUser, isActive: t.isActive,
      })),
    }));
  }

  // --------------------------------------------------------------- JGY-81
  async listUsers(role: string, search: string | undefined) {
    if (role !== 'ADMIN') throw new ApiError('FORBIDDEN');
    const where: Prisma.UserWhereInput = {};
    if (search !== undefined && search.trim() !== '') {
      const needle = search.trim();
      where.OR = [
        { email: { contains: needle, mode: 'insensitive' } },
        { fullName: { contains: needle, mode: 'insensitive' } },
      ];
    }
    const users = await this.prisma.user.findMany({
      where,
      select: {
        id: true, email: true, fullName: true, phone: true,
        role: true, locale: true, isActive: true, createdAt: true,
      },
      orderBy: { id: 'asc' },
    });
    return users;
  }

  // --------------------------------------------------------------- JGY-82
  async setUserRole(actor: { id: number; role: string }, targetUserId: number, newRole: string) {
    if (actor.role !== 'ADMIN') throw new ApiError('FORBIDDEN');
    if (!ROLES.includes(newRole)) {
      throw new ApiError('VALIDATION_ERROR', { field: 'role', reason: `one of ${ROLES.join(',')}` });
    }
    const target = await this.prisma.user.findUnique({ where: { id: targetUserId } });
    if (!target) throw new ApiError('NOT_FOUND');

    // Single-admin self-demotion protection: if the actor demotes itself and it
    // is the last admin, refuse.
    if (actor.id === targetUserId && target.role === 'ADMIN' && newRole !== 'ADMIN') {
      const adminCount = await this.prisma.user.count({ where: { role: 'ADMIN', isActive: true } });
      if (adminCount <= 1) {
        throw new ApiError('VALIDATION_ERROR', { reason: 'cannot demote the only admin (FR-808)' });
      }
    }

    await this.prisma.user.update({ where: { id: targetUserId }, data: { role: newRole as UserRole } });
    return { id: targetUserId, role: newRole };
  }

  // --------------------------------------------------------------- JGY-83
  async setUserActive(actor: { id: number; role: string }, targetUserId: number, isActive: boolean) {
    if (actor.role !== 'ADMIN') throw new ApiError('FORBIDDEN');
    const target = await this.prisma.user.findUnique({ where: { id: targetUserId } });
    if (!target) throw new ApiError('NOT_FOUND');
    // A deactivated admin could lock itself out; consistent with the role
    // guard, the last active admin cannot deactivate itself.
    if (actor.id === targetUserId && target.role === 'ADMIN' && !isActive) {
      const adminCount = await this.prisma.user.count({ where: { role: 'ADMIN', isActive: true } });
      if (adminCount <= 1) {
        throw new ApiError('VALIDATION_ERROR', { reason: 'cannot deactivate the only admin (FR-808)' });
      }
    }
    await this.prisma.user.update({ where: { id: targetUserId }, data: { isActive } });
    // BR-21: previously issued tokens become invalid — deactivate refresh tokens.
    if (!isActive) {
      await this.prisma.$executeRaw`
        UPDATE "RefreshToken" SET "revokedAt" = now() WHERE "userId" = ${targetUserId} AND "revokedAt" IS NULL`;
    }
    return { id: targetUserId, isActive };
  }

  // --------------------------------------------------------------- JGY-84
  async listBookings(
    userId: number,
    role: string,
    filters: { eventId?: number; status?: string; dateFrom?: string; dateTo?: string },
  ) {
    // BR-20: VASARLO has no backoffice view at all.
    if (role === 'VASARLO') throw new ApiError('FORBIDDEN');

    const where: Prisma.BookingWhereInput = {};
    if (role === 'SZERVEZO') {
      // SZERVEZO sees only bookings of its own events — enforced in-query.
      where.event = { organizerUserId: userId };
      if (filters.eventId !== undefined) {
        where.event = { organizerUserId: userId, id: filters.eventId };
      }
    } else {
      if (filters.eventId !== undefined) {
        if (!Number.isInteger(filters.eventId) || filters.eventId <= 0) {
          throw new ApiError('VALIDATION_ERROR', { field: 'eventId', reason: 'positive integer' });
        }
        where.eventId = filters.eventId;
      }
    }
    if (filters.status !== undefined) {
      const st = filters.status as BookingStatus;
      if (!BOOKING_STATUSES.includes(st)) {
        throw new ApiError('VALIDATION_ERROR', { field: 'status', reason: `one of ${BOOKING_STATUSES.join(',')}` });
      }
      where.status = st;
    }
    if (filters.dateFrom !== undefined || filters.dateTo !== undefined) {
      if ((filters.dateFrom && !isDate(filters.dateFrom)) || (filters.dateTo && !isDate(filters.dateTo))) {
        throw new ApiError('VALIDATION_ERROR', { field: 'dateFrom/dateTo', reason: 'ISO datetime' });
      }
      const from = filters.dateFrom ? new Date(filters.dateFrom) : undefined;
      const to = filters.dateTo ? new Date(filters.dateTo) : undefined;
      where.createdAt = {
        ...(from ? { gte: from } : {}),
        ...(to ? { lte: to } : {}),
      };
    }
    const rows = await this.prisma.booking.findMany({
      where,
      include: { event: { select: { id: true, name: true, organizerUserId: true } } },
      orderBy: { id: 'asc' },
    });
    return rows.map((b) => ({
      id: b.id, code: b.code, status: b.status,
      userId: b.userId, eventId: b.event.id, eventName: b.event.name,
      subtotal: b.subtotal, serviceFee: b.serviceFee, total: b.total,
      createdAt: b.createdAt, holdExpiresAt: b.holdExpiresAt,
      paidAt: b.paidAt, canceledAt: b.canceledAt,
    }));
  }

  // --------------------------------------------------------------- JGY-85
  async bookingDetail(userId: number, role: string, bookingId: number) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        items: { include: { ticketType: true, seat: { include: { row: { include: { section: true } } } } } },
        tickets: true,
        payments: true,
        refund: true,
        event: { select: { id: true, name: true, organizerUserId: true } },
      },
    });
    if (!booking) throw new ApiError('BOOKING_NOT_FOUND');

    // BR-20: the owner, the event's organizer or an admin.
    const isOwner = booking.userId === userId;
    const isOrganizer = role === 'SZERVEZO' && booking.event.organizerUserId === userId;
    const isAdmin = role === 'ADMIN';
    if (!isOwner && !isOrganizer && !isAdmin) throw new ApiError('FORBIDDEN');

    return {
      id: booking.id, code: booking.code, status: booking.status,
      eventId: booking.event.id, eventName: booking.event.name,
      userId: booking.userId,
      items: booking.items.map((it) => ({
        id: it.id, ticketTypeId: it.ticketTypeId, ticketTypeName: it.ticketType.name,
        seatId: it.seatId,
        seatLabel: it.seat
          ? `${it.seat.row.section.name}/${it.seat.row.label} sor/${it.seat.label}`
          : null,
        quantity: it.quantity, unitPrice: it.unitPrice, lineTotal: it.lineTotal,
      })),
      subtotal: booking.subtotal, serviceFee: booking.serviceFee, total: booking.total,
      currency: booking.currency,
      holdExpiresAt: booking.holdExpiresAt, createdAt: booking.createdAt,
      paidAt: booking.paidAt, canceledAt: booking.canceledAt,
      payments: booking.payments.map((p) => ({
        id: p.id, amount: p.amount, status: p.status,
        cardLast4: p.cardLast4, cardBrand: p.cardBrand,
        pspReference: p.pspReference, errorCode: p.errorCode,
        attemptNumber: p.attemptNumber, createdAt: p.createdAt,
      })),
      tickets: booking.tickets.map((t) => ({
        id: t.id, code: t.code, status: t.status,
        issuedAt: t.issuedAt, revokedAt: t.revokedAt,
      })),
      refund: booking.refund
        ? {
            id: booking.refund.id, amount: booking.refund.amount,
            reason: booking.refund.reason, status: booking.refund.status,
            createdAt: booking.refund.createdAt, completedAt: booking.refund.completedAt,
          }
        : null,
    };
  }

  // --------------------------------------------------------------- JGY-86
  async eventStatistics(userId: number, role: string, eventId: number) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      include: { ticketTypes: true },
    });
    if (!event) throw new ApiError('EVENT_NOT_FOUND');
    this.assertCanManage(userId, role, event);

    const ledger = await this.prisma.ledgerEntry.groupBy({
      by: ['type'],
      _sum: { amount: true },
      where: { eventId },
    });
    // FR-812 / 02-domain: revenue = Σ(BEVETEL) − Σ(VISSZATERITES)
    const revenue = ledger.reduce(
      (sum, g) => sum + (g.type === 'VISSZATERITES' ? -(g._sum.amount ?? 0) : (g._sum.amount ?? 0)),
      0,
    );

    // Sold tickets: seat-based tickets + standing quantities of paid bookings.
    const seatTickets = await this.prisma.ticket.count({
      where: { booking: { status: 'FIZETVE' }, ticketType: { eventId } },
    });
    const standingAgg = await this.prisma.bookingItem.aggregate({
      _sum: { quantity: true },
      where: {
        seatId: null,
        booking: { status: 'FIZETVE' },
        ticketType: { eventId },
      },
    });
    const soldTickets = seatTickets + (standingAgg._sum.quantity ?? 0);

    // Total capacity: seated (SeatStates created for the event) + active
    // standing ticket-type capacities.
    const seatedCapacity = await this.prisma.seatState.count({ where: { eventId } });
    const standingCapacity = event.ticketTypes.reduce((s, t) => s + (t.capacity ?? 0), 0);
    const totalCapacity = seatedCapacity + standingCapacity;

    const utilization = totalCapacity > 0 ? Math.round((soldTickets / totalCapacity) * 1000) / 10 : 0;
    return {
      eventId, soldTickets, revenue, utilization, totalCapacity,
      revenueBreakdown: ledger.reduce((acc, g) => {
        if (g.type === 'VISSZATERITES') { acc['VISSZATERITES'] = -(g._sum.amount ?? 0); }
        else if (g.type === 'BEVETEL') { acc[g.type] = g._sum.amount ?? 0; }
        return acc;
      }, {} as Record<string, number>),
    };
  }

  // --------------------------------------------------------------- JGY-88
  async listRefunds(
    role: string,
    filters: { status?: string; eventId?: number; dateFrom?: string; dateTo?: string },
  ) {
    if (role !== 'ADMIN') throw new ApiError('FORBIDDEN');
    const where: Prisma.RefundWhereInput = {};
    if (filters.status !== undefined) {
      const st = filters.status as 'FUGGO' | 'SIKERES' | 'SIKERTELEN';
      if (!['FUGGO', 'SIKERES', 'SIKERTELEN'].includes(st)) {
        throw new ApiError('VALIDATION_ERROR', { field: 'status', reason: 'one of FUGGO,SIKERES,SIKERTELEN' });
      }
      where.status = st;
    }
    if (filters.eventId !== undefined) {
      if (!Number.isInteger(filters.eventId) || filters.eventId <= 0) {
        throw new ApiError('VALIDATION_ERROR', { field: 'eventId', reason: 'positive integer' });
      }
      where.booking = { eventId: filters.eventId };
    }
    if (filters.dateFrom !== undefined || filters.dateTo !== undefined) {
      if ((filters.dateFrom && !isDate(filters.dateFrom)) || (filters.dateTo && !isDate(filters.dateTo))) {
        throw new ApiError('VALIDATION_ERROR', { field: 'dateFrom/dateTo', reason: 'ISO datetime' });
      }
      const from = filters.dateFrom ? new Date(filters.dateFrom) : undefined;
      const to = filters.dateTo ? new Date(filters.dateTo) : undefined;
      where.createdAt = {
        ...(from ? { gte: from } : {}),
        ...(to ? { lte: to } : {}),
      };
    }
    const rows = await this.prisma.refund.findMany({
      where,
      include: { booking: { select: { id: true, code: true, event: { select: { id: true, name: true } } } } },
      orderBy: { id: 'asc' },
    });
    return rows.map((r) => ({
      id: r.id,
      bookingId: r.bookingId, bookingCode: r.booking.code,
      eventId: r.booking.event.id, eventName: r.booking.event.name,
      amount: r.amount, reason: r.reason, status: r.status,
      initiatedByUserId: r.initiatedByUserId,
      createdAt: r.createdAt, completedAt: r.completedAt,
    }));
  }

  // ---------------------------------------------------------- shared read
  async eventDetail(eventId: number) {
    const e = await this.prisma.event.findUnique({
      where: { id: eventId },
      include: { venue: true, ticketTypes: true },
    });
    if (!e) throw new ApiError('EVENT_NOT_FOUND');
    return {
      id: e.id, name: e.name, category: e.category, status: e.status,
      venueId: e.venueId, venueName: e.venue.name, venueIsActive: e.venue.isActive,
      organizerUserId: e.organizerUserId,
      startsAt: e.startsAt, endsAt: e.endsAt, doorsOpenAt: e.doorsOpenAt,
      durationMinutes: e.durationMinutes, description: e.description,
      posterUrl: e.posterUrl, salesStartAt: e.salesStartAt, salesEndAt: e.salesEndAt,
      publishedAt: e.publishedAt,
      ticketTypes: e.ticketTypes.map((t) => ({
        id: t.id, name: t.name, price: t.price, capacity: t.capacity,
        maxPerUser: t.maxPerUser, isActive: t.isActive,
        salesStartAt: t.salesStartAt, salesEndAt: t.salesEndAt,
      })),
    };
  }

  // ----------------------------------------------------- JGY-90..96 cancel
  /**
   * Admin cancels an event (FR-901). One transaction (NFR-15):
   *  - event → LEMONDVA (FR-901) — only from PUBLIKALT / ERTEKESITES_SZUNETELT
   *  - FIZETVE bookings → Refund (BR-10, full amount) + VISSZATERITES ledger
   *    + booking → VISSZATERITVE
   *  - ZAROLT / FIZETESRE_VAR bookings → LEMONDVA, seats → SZABAD
   *  - all tickets of the event → VISSZAVONT + revokedAt (BR-18)
   * Refund.bookingId @unique makes a second refund impossible at DB level
   * even under concurrent cancellations (JGY-96, NFR-02).
   */
  async cancelEvent(actor: { id: number; role: string }, eventId: number) {
    if (actor.role !== 'ADMIN') throw new ApiError('FORBIDDEN');
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event) throw new ApiError('EVENT_NOT_FOUND');
    if (event.status !== EventStatus.PUBLIKALT && event.status !== EventStatus.ERTEKESITES_SZUNETELT) {
      throw new ApiError('EVENT_INVALID_STATE');
    }

    const now = new Date();
    const payloads = await this.prisma.$transaction(async (tx) => {
      await tx.event.update({
        where: { id: eventId },
        data: { status: EventStatus.LEMONDVA },
      });

      // Tickets → VISSZAVONT, only ERVENYES ones (FR-904/BR-18, JGY-93).
      await tx.ticket.updateMany({
        where: { booking: { eventId }, status: TicketStatus.ERVENYES },
        data: { status: TicketStatus.VISSZAVONT, revokedAt: now },
      });

      // Seat states of paid bookings: seat stays tied to the (refunded)
      // booking; states of pending bookings are freed below.
      const pending = await tx.booking.findMany({
        where: { eventId, status: { in: [BookingStatus.ZAROLT, BookingStatus.FIZETESRE_VAR] } },
      });
      const paid = await tx.booking.findMany({
        where: { eventId, status: BookingStatus.FIZETVE },
      });

      // Pending bookings: seats freed, holds cleared (FR-903, JGY-92).
      for (const b of pending) {
        await tx.booking.update({
          where: { id: b.id },
          data: { status: BookingStatus.LEMONDVA, canceledAt: now, holdExpiresAt: now },
        });
      }
      await tx.seatState.updateMany({
        where: {
          eventId,
          bookingId: { in: pending.length > 0 ? pending.map((b) => b.id) : [-1] },
        },
        data: { state: SeatStateEnum.SZABAD, bookingId: null, holdExpiresAt: null },
      });

      // Paid bookings: full refund in the same transaction (BR-10, FR-902).
      const refunds: { bookingId: number; amount: number; email: string }[] = [];
      for (const b of paid) {
        const existing = await tx.refund.findUnique({ where: { bookingId: b.id } });
        if (existing) {
          // Concurrent/keyed duplicate — no second Refund, no second ledger.
          if (existing.status === 'SIKERES') throw new ApiError('REFUND_ALREADY_ISSUED');
          // A FUGGO/failed attempt exists but no money moved yet: overwrite.
          await tx.refund.delete({ where: { id: existing.id } });
        }
        await tx.booking.update({
          where: { id: b.id },
          data: { status: BookingStatus.VISSZATERITVE },
        });
        await tx.refund.create({
          data: {
            bookingId: b.id, amount: b.total,
            reason: 'ESEMENY_LEMONDVA', status: 'SIKERES',
            initiatedByUserId: actor.id, completedAt: now,
          },
        });
        await tx.ledgerEntry.create({
          data: {
            type: 'VISSZATERITES', bookingId: b.id, eventId,
            amount: b.total, description: 'ESEMENY_LEMONDVA',
          },
        });
        const u = await tx.user.findUnique({ where: { id: b.userId } });
        refunds.push({ bookingId: b.id, amount: b.total, email: u?.email ?? '' });
      }
      return { event, refunds, pendingCount: pending.length };
    });

    // Mails outside the transaction (BR-09 analog): a failure must not roll
    // the refund back, but each attempt is recorded in EmailNotification.
    // Every distinct buyer of the event gets ESEMENY_LEMONDVA; each refunded
    // buyer additionally gets VISSZATERITES_TELJESITVE (FR-905).
    const affected = await this.email.prismaDistinctEmails(eventId);
    for (const email of affected) {
      await this.email.sendTemplatedMail(email, 'ESEMENY_LEMONDVA', {
        eventName: payloads.event.name,
      });
    }
    for (const r of payloads.refunds) {
      if (!r.email) continue;
      await this.email.sendTemplatedMail(r.email, 'VISSZATERITES_TELJESITVE', {
        eventName: payloads.event.name, amount: r.amount,
      });
    }

    return this.eventDetail(eventId);
  }
}
