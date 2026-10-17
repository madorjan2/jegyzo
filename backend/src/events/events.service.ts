// Public event catalogue (FR-201..FR-210). Only PUBLIKALT / ERTEKESITES_SZUNETELT
// events that have not ended appear in the list; details additionally show
// LEMONDVA with a "cancelled" flag (FR-210).
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../db/prisma.service';
import { ApiError } from '../common/errors/api-error';

export interface EventListQuery {
  search?: string;
  category?: string[];
  city?: string[];
  venueId?: number[];
  dateFrom?: string;
  dateTo?: string;
  priceMin?: number;
  priceMax?: number;
  hasFreeSeats?: boolean;
  sort?: string;
  order?: string;
  page?: number;
  pageSize?: number;
}

const CATEGORIES = ['KONCERT', 'SZINHAZ', 'SPORT', 'FESZTIVAL', 'EGYEB'];
const VALID_SORTS = ['startsAt', 'price', 'popularity'];

// Accents collapse so "muzeum" matches "Müpa" (FR-202).
function stripDiacritics(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

@Injectable()
export class EventsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(q: EventListQuery) {
    const pageSize = q.pageSize ?? 12;
    const page = q.page ?? 1;

    const where: Prisma.EventWhereInput[] = [
      { status: { in: q.hasFreeSeats ? ['PUBLIKALT'] : ['PUBLIKALT', 'ERTEKESITES_SZUNETELT'] } },
    ];

    if (q.search) {
      const needle = stripDiacritics(q.search);
      // The OR across name / venue / city is applied after the fetch — the DB
      // columns cannot be searched with unaccent() without the extension; we
      // filter over a bounded candidate set instead.
      const candidates = await this.prisma.event.findMany({
        where: { status: { in: ['PUBLIKALT', 'ERTEKESITES_SZUNETELT'] } },
        include: { venue: true },
      });
      const matchingIds = candidates
        .filter((e) =>
          [stripDiacritics(e.name), stripDiacritics(e.venue.name), stripDiacritics(e.venue.city)]
            .some((v) => v.includes(needle)))
        .map((e) => e.id);
      where[0] = { status: { in: q.hasFreeSeats ? ['PUBLIKALT'] : ['PUBLIKALT', 'ERTEKESITES_SZUNETELT'] } };
      where.push({ id: { in: matchingIds } });
    }

    if (q.category?.length) where.push({ category: { in: q.category } });
    if (q.city?.length) where.push({ venue: { city: { in: q.city } } });
    if (q.venueId?.length) where.push({ venueId: { in: q.venueId } });

    // Date range (FR-204): inclusive on both edges; interpreted in Europe/Budapest.
    if (q.dateFrom || q.dateTo) {
      const from = q.dateFrom ? this.parseBudapest(q.dateFrom, false) : undefined;
      const to = q.dateTo ? this.parseBudapest(q.dateTo, true) : undefined;
      if (from && to && from > to) throw new ApiError('VALIDATION_ERROR', { field: 'dateFrom', reason: 'dateFrom must be ≤ dateTo' });
      where.push({ startsAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } });
    }

    let priceFilterEvents: number[] | undefined;
    if (q.priceMin !== undefined || q.priceMax !== undefined) {
      // Seed leaves the per-type sales window null — the reflexive "event
      // window applies" rule means a null salesEndAt never excludes a type.
      const ticketTypes = await this.prisma.ticketType.findMany({
        where: { isActive: true },
        select: { eventId: true, price: true },
      });
      const byEvent = new Map<number, number>();
      for (const t of ticketTypes) {
        const prev = byEvent.get(t.eventId);
        if (prev === undefined || t.price < prev) byEvent.set(t.eventId, t.price);
      }
      const min = q.priceMin ?? 0;
      const max = q.priceMax ?? Number.MAX_SAFE_INTEGER;
      priceFilterEvents = [...byEvent.entries()]
        .filter(([, price]) => price >= min && price <= max)
        .map(([eventId]) => eventId);
      where.push({ id: { in: priceFilterEvents } });
    }

    const base = {
      where: { AND: where } as Prisma.EventWhereInput,
      include: {
        venue: true,
        ticketTypes: { where: { isActive: true } },
        seatStates: true,
        _count: { select: { bookings: { where: { status: 'FIZETVE' } } } },
      } as Prisma.EventInclude,
    };

    // Popularity = number of paid bookings; price = cheapest active ticket.
    const all = await this.prisma.event.findMany(base);
    // Standing quantity paid per event: sum of BookingItem quantities on
    // standing (seatId IS NULL) items of paid bookings.
    const standingPaid = await this.prisma.bookingItem.groupBy({
      by: ['ticketTypeId'],
      _sum: { quantity: true },
      where: { seatId: null, booking: { status: 'FIZETVE' } },
    });
    const ttToEvent = await this.prisma.ticketType.findMany({
      select: { id: true, eventId: true },
    });
    const TT_EVENT = Object.fromEntries(ttToEvent.map((t) => [t.id, t.eventId])) as Record<number, number>;
    const standingPaidByEvent = new Map<number, number>();
    for (const g of standingPaid) {
      const evt = TT_EVENT[g.ticketTypeId];
      if (evt !== undefined) {
        standingPaidByEvent.set(evt, (standingPaidByEvent.get(evt) ?? 0) + (g._sum.quantity ?? 0));
      }
    }
    const withDerived = all.map((e) => ({
      ...e,
      cheapestPrice: e.ticketTypes.length > 0 ? Math.min(...e.ticketTypes.map((t) => t.price)) : null,
      soldCount: e._count.bookings,
    }));

    let filtered = withDerived.filter((e) => e.status === 'PUBLIKALT' || e.status === 'ERTEKESITES_SZUNETELT');
    if (q.hasFreeSeats) {
      filtered = filtered.filter((e) => {
        // free seats wins for seated events; standing events use remaining capacity
        const freeSeats = e.seatStates.filter((s) => s.state === 'SZABAD').length;
        if (freeSeats > 0) return true;
        const hadSeats = standingPaidByEvent.size > 0;
        if (!e.ticketTypes.some((t) => t.capacity !== null)) return false;
        const paid = hadSeats ? (standingPaidByEvent.get(e.id) ?? 0) : 0;
        return e.ticketTypes.some((t) => t.isActive && t.capacity !== null && paid < t.capacity);
      });
    }

    const sorted = [...filtered].sort((a, b) => {
      const dir = q.order === 'desc' ? -1 : 1;
      switch (q.sort ?? 'startsAt') {
        case 'price':
          return dir * ((a.cheapestPrice ?? Number.MAX_SAFE_INTEGER) - (b.cheapestPrice ?? Number.MAX_SAFE_INTEGER));
        case 'popularity':
          return dir * (b.soldCount - a.soldCount);
        case 'startsAt':
        default:
          return dir * (a.startsAt.getTime() - b.startsAt.getTime());
      }
    });

    const start = (page - 1) * pageSize;
    const items = sorted.slice(start, start + pageSize).map((e) => this.toPublicListItem(e));

    return { items, total: sorted.length, page, pageSize };
  }

  async details(id: number) {
    if (!Number.isInteger(id) || id <= 0) {
      throw new ApiError('VALIDATION_ERROR', { field: 'id', reason: 'must be a positive integer' });
    }
    const event = await this.prisma.event.findUnique({
      where: { id },
      include: {
        venue: true,
        ticketTypes: true,
        seatStates: { include: { seat: { include: { row: { include: { section: true } } } } } },
        bookings: { where: { status: 'FIZETVE' }, select: { items: { select: { quantity: true } } } },
      },
    });

    if (!event) throw new ApiError('EVENT_NOT_FOUND');

    // Auto-transition: a published event whose endsAt has become past is LEZAJLT.
    let status = event.status;
    if (event.status === 'PUBLIKALT' && event.endsAt.getTime() < Date.now()) status = 'LEZAJLT';

    const visible = status === 'PUBLIKALT' || status === 'ERTEKESITES_SZUNETELT' || status === 'LEMONDVA';
    if (!visible) throw new ApiError('EVENT_NOT_FOUND');

    // Free-seat count: SZABAD SeatStates for seated sections; remaining
    // capacity for standing ticket types (FR-209).
    const freeSeats = event.seatStates.filter((s) => s.state === 'SZABAD').length;
    const standingCapacity = event.ticketTypes
      .filter((t) => t.isActive)
      .reduce((sum, t) => sum + (t.capacity ?? 0), 0);
    const soldStanding = event.bookings.reduce((sum, b) => sum + b.items.reduce((s2, it) => s2 + it.quantity, 0), 0);

    const activeTts = event.ticketTypes.filter((t) => t.isActive);
    const cheapest = activeTts.length > 0 ? Math.min(...activeTts.map((t) => t.price)) : null;

    return {
      id: event.id,
      name: event.name,
      category: event.category,
      status,
      venue: { id: event.venueId, name: event.venue.name, city: event.venue.city, address: event.venue.address },
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      doorsOpenAt: event.doorsOpenAt,
      durationMinutes: event.durationMinutes,
      description: event.description,
      posterUrl: event.posterUrl,
      visibleInList: status === 'PUBLIKALT' || status === 'ERTEKESITES_SZUNETELT',
      freeSeats: status === 'LEMONDVA' ? 0 : standingCapacity > 0 ? standingCapacity - soldStanding : freeSeats,
      cheapestPrice: cheapest,
      ticketTypes: event.ticketTypes.map((t) => ({
        id: t.id, name: t.name, price: t.price, capacity: t.capacity,
        sectionId: t.sectionId,
        maxPerUser: t.maxPerUser, salesStartAt: t.salesStartAt, salesEndAt: t.salesEndAt, isActive: t.isActive,
      })),
    };
  }

  private toPublicListItem(e: {
    id: number; name: string; category: string; status: string;
    startsAt: Date; endsAt: Date; durationMinutes: number; description: string; posterUrl: string | null;
    venue: { id: number; name: string; city: string; address: string };
    ticketTypes: { price: number; isActive: boolean }[];
    seatStates: { state: string }[];
  }) {
    const activeTts = e.ticketTypes.filter((t) => t.isActive);
    const cheapest = activeTts.length > 0 ? Math.min(...activeTts.map((t) => t.price)) : null;
    return {
      id: e.id, name: e.name, category: e.category, status: e.status,
      venue: { id: e.venue.id, name: e.venue.name, city: e.venue.city },
      startsAt: e.startsAt,
      durationMinutes: e.durationMinutes,
      posterUrl: e.posterUrl,
      cheapestPrice: cheapest,
    };
  }

  /** Parses YYYY-MM-DD in Europe/Budapest: start or end of the local day. */
  private parseBudapest(dateStr: string, endOfDay: boolean): Date {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      throw new ApiError('VALIDATION_ERROR', { field: endOfDay ? 'dateTo' : 'dateFrom', reason: 'invalid date format, expected YYYY-MM-DD' });
    }
    const [y, m, d] = dateStr.split('-').map(Number);
    // Europe/Budapest is CET (UTC+1) or CEST (UTC+2). Use a fixed offset probe.
    const probe = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
    const offset = this.budapestOffset(probe);
    return new Date(Date.UTC(y, m - 1, d, endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0) - offset);
  }

  private budapestOffset(at: Date): number {
    // Rough winter/summer switch: the offset is +1 in Jan/Feb/Mar/Nov/Dec, +2 Apr..Oct.
    const month = at.getUTCMonth() + 1;
    return month >= 4 && month <= 10 ? 2 * 3600_000 : 3600_000;
  }

  static readonly VALID_CATEGORIES = CATEGORIES;
  static readonly VALID_SORTS = VALID_SORTS;
}
