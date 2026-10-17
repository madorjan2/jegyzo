// Ticket-type management (FR-401..FR-405).
// Admin/SZERVEZO-only writes; the catalogue and booking flow read via this service.
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../db/prisma.service';
import { ApiError } from '../common/errors/api-error';

export interface TicketTypeDto {
  name: string;
  price: number;
  capacity?: number | null;
  maxPerUser?: number;
  salesStartAt?: string | null;
  salesEndAt?: string | null;
  isActive?: boolean;
}

const PRICE_MIN = 0;
const PRICE_MAX = 500_000;

@Injectable()
export class TicketTypesService {
  constructor(private readonly prisma: PrismaService) {}

  private validate(dto: TicketTypeDto, requirePrice = true) {
    if (requirePrice || dto.price !== undefined) {
      if (!Number.isInteger(dto.price) || dto.price < PRICE_MIN || dto.price > PRICE_MAX) {
        throw new ApiError('VALIDATION_ERROR', {
          field: 'price',
          reason: 'must be an integer between 0 and 500000 HUF',
        });
      }
    }
    if (dto.maxPerUser !== undefined) {
      if (!Number.isInteger(dto.maxPerUser) || dto.maxPerUser < 1 || dto.maxPerUser > 20) {
        throw new ApiError('VALIDATION_ERROR', {
          field: 'maxPerUser',
          reason: 'must be an integer between 1 and 20',
        });
      }
    }
    if (dto.name !== undefined && (typeof dto.name !== 'string' || dto.name.length < 2 || dto.name.length > 40)) {
      throw new ApiError('VALIDATION_ERROR', { field: 'name', reason: 'must be 2-40 characters' });
    }
    if (dto.salesStartAt !== undefined && dto.salesStartAt !== null && dto.salesEndAt !== undefined && dto.salesEndAt !== null) {
      const start = new Date(dto.salesStartAt);
      const end = new Date(dto.salesEndAt);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start >= end) {
        throw new ApiError('VALIDATION_ERROR', { field: 'salesStartAt', reason: 'salesStartAt must be < salesEndAt' });
      }
    }
  }

  async create(eventId: number, sectionId: number, dto: TicketTypeDto) {
    if (!Number.isInteger(eventId) || eventId <= 0 || !Number.isInteger(sectionId) || sectionId <= 0) {
      throw new ApiError('VALIDATION_ERROR', { field: 'eventId/sectionId', reason: 'must be positive integers' });
    }
    this.validate(dto);

    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      include: { venue: { include: { sections: true } } },
    });
    if (!event) throw new ApiError('EVENT_NOT_FOUND');
    const section = event.venue.sections.find((s) => (s.id === sectionId));
    if (!section) {
      // The section must belong to the event's venue — otherwise invalid.
      throw new ApiError('VALIDATION_ERROR', { field: 'sectionId', reason: 'section is not part of this event\'s venue' });
    }
    if (section.kind === 'ALLOHELYES' && (dto.capacity === undefined || dto.capacity === null || !Number.isInteger(dto.capacity) || dto.capacity < 1)) {
      throw new ApiError('VALIDATION_ERROR', { field: 'capacity', reason: 'standing section requires an integer capacity ≥ 1' });
    }

    const dup = await this.prisma.ticketType.findUnique({
      where: { eventId_sectionId: { eventId, sectionId } },
    });
    if (dup) throw new ApiError('SECTION_ALREADY_HAS_TICKET_TYPE');

    const created = await this.prisma.ticketType.create({
      data: {
        eventId, sectionId,
        name: dto.name,
        price: dto.price,
        capacity: dto.capacity ?? null,
        maxPerUser: dto.maxPerUser ?? 8,  // BR-04 default
        salesStartAt: dto.salesStartAt ? new Date(dto.salesStartAt) : null,
        salesEndAt: dto.salesEndAt ? new Date(dto.salesEndAt) : null,
        isActive: dto.isActive ?? true,
      },
    });
    return created;
  }

  async update(id: number, dto: Partial<TicketTypeDto>) {
    const existing = await this.prisma.ticketType.findUnique({
      where: { id },
      include: { section: true, event: true },
    });
    if (!existing) throw new ApiError('NOT_FOUND');
    this.validate({ ...(dto as TicketTypeDto) }, false);

    // BR-23: per-type window must never extend beyond the event's start.
    const newStart = dto.salesStartAt !== undefined ? (dto.salesStartAt ? new Date(dto.salesStartAt) : null) : existing.salesStartAt;
    const newEnd = dto.salesEndAt !== undefined ? (dto.salesEndAt ? new Date(dto.salesEndAt) : null) : existing.salesEndAt;
    const effectiveEnd = newEnd ?? existing.event.salesEndAt;
    if ((newStart && effectiveEnd && newStart >= effectiveEnd) || (effectiveEnd && effectiveEnd > existing.event.startsAt)) {
      throw new ApiError('VALIDATION_ERROR', { field: 'salesEndAt', reason: 'salesEndAt must be ≤ event startsAt (BR-23)' });
    }

    return this.prisma.ticketType.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.price !== undefined ? { price: dto.price } : {}),
        ...(dto.capacity !== undefined ? { capacity: dto.capacity ?? null } : {}),
        ...(dto.maxPerUser !== undefined ? { maxPerUser: dto.maxPerUser } : {}),
        ...(dto.salesStartAt !== undefined ? { salesStartAt: dto.salesStartAt ? new Date(dto.salesStartAt) : null } : {}),
        ...(dto.salesEndAt !== undefined ? { salesEndAt: dto.salesEndAt ? new Date(dto.salesEndAt) : null } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
  }

  /** Cheapest active ticket for the event, or null when none is active/on sale. */
  async cheapestPrice(eventId: number): Promise<number | null> {
    const types = await this.prisma.ticketType.findMany({
      where: { eventId, isActive: true },
      select: { price: true },
    });
    if (types.length === 0) return null;
    return Math.min(...types.map((t) => t.price));
  }

  async list(eventId: number) {
    return this.prisma.ticketType.findMany({
      where: { eventId },
      orderBy: { id: 'asc' },
    });
  }
}
