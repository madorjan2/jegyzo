// Venue management (FR-301..FR-307). Admin-only write paths; public read path
// returns active venues for the catalogue.
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../db/prisma.service';
import { ApiError } from '../common/errors/api-error';

export interface VenueDto {
  name: string;
  city: string;
  address: string;
  description?: string | null;
  isActive?: boolean;
}

export interface SectionInput {
  name: string;
  kind: 'ULOHELYES' | 'ALLOHELYES';
  /** ULOHELYES: seat count per row; first entry is row 1 (A). */
  rowSeatCounts?: number[];
  /** Row labels; defaults to A, B, C… generated from rowSeatCounts length. */
  rowLabels?: string[];
  /** ALLOHELYES: fixed capacity ≥ 1. */
  capacity?: number;
  position?: number;
}

export function rowLabel(r: number): string {
  if (r < 26) return String.fromCharCode(65 + r);
  return rowLabel(Math.floor(r / 26) - 1) + String.fromCharCode(65 + (r % 26));
}

@Injectable()
export class VenuesService {
  constructor(private readonly prisma: PrismaService) {}

  private validate(dto: VenueDto) {
    if (typeof dto.name !== 'string' || dto.name.length < 3 || dto.name.length > 120) {
      throw new ApiError('VALIDATION_ERROR', { field: 'name', reason: 'must be 3-120 characters' });
    }
    if (typeof dto.city !== 'string' || dto.city.length < 2 || dto.city.length > 60) {
      throw new ApiError('VALIDATION_ERROR', { field: 'city', reason: 'must be 2-60 characters' });
    }
    if (typeof dto.address !== 'string' || dto.address.length < 5 || dto.address.length > 200) {
      throw new ApiError('VALIDATION_ERROR', { field: 'address', reason: 'must be 5-200 characters' });
    }
    if (dto.description !== undefined && dto.description !== null && dto.description.length > 2000) {
      throw new ApiError('VALIDATION_ERROR', { field: 'description', reason: 'max 2000 characters' });
    }
  }

  async recomputeCapacity(venueId: number): Promise<number> {
    const venue = await this.prisma.venue.findUnique({
      where: { id: venueId },
      include: { sections: { include: { rows: { include: { seats: true } } } } },
    });
    if (!venue) throw new ApiError('NOT_FOUND');
    let total = 0;
    for (const s of venue.sections) {
      if (s.kind === 'ALLOHELYES') total += s.capacity ?? 0;
      else total += (s.rows ?? []).reduce((sum, r) => sum + (r.seats?.length ?? 0), 0);
    }
    await this.prisma.venue.update({ where: { id: venueId }, data: { totalCapacity: total } });
    return total;
  }

  async create(dto: VenueDto, sections?: SectionInput[]) {
    if (!dto || typeof dto !== 'object') {
      throw new ApiError('VALIDATION_ERROR');
    }
    this.validate(dto);
    const venue = await this.prisma.venue.create({
      data: {
        name: dto.name, city: dto.city, address: dto.address,
        description: dto.description ?? null, isActive: dto.isActive ?? true, totalCapacity: 0,
      },
    });
    if (sections) await this.addSections(venue.id, sections);
    await this.recomputeCapacity(venue.id);
    return this.prisma.venue.findUnique({ where: { id: venue.id }, include: { sections: { orderBy: { position: 'asc' } } } });
  }

  async update(id: number, dto: Partial<VenueDto>) {
    const existing = await this.prisma.venue.findUnique({ where: { id } });
    if (!existing) throw new ApiError('NOT_FOUND');
    if (dto.name !== undefined || dto.city !== undefined || dto.address !== undefined || dto.description !== undefined) {
      this.validate({ name: dto.name ?? existing.name, city: dto.city ?? existing.city, address: dto.address ?? existing.address, description: dto.description ?? existing.description });
    }
    const updated = await this.prisma.venue.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.city !== undefined ? { city: dto.city } : {}),
        ...(dto.address !== undefined ? { address: dto.address } : {}),
        ...(dto.description !== undefined ? { description: dto.description ?? null } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
    await this.recomputeCapacity(id);
    return this.prisma.venue.findUnique({ where: { id: updated.id }, include: { sections: { orderBy: { position: 'asc' } } } });
  }

  async addSections(venueId: number, sections: SectionInput[]) {
    const venue = await this.prisma.venue.findUnique({ where: { id: venueId } });
    if (!venue) throw new ApiError('NOT_FOUND');
    for (let i = 0; i < sections.length; i++) {
      const sec = sections[i];
      if (sec.kind === 'ALLOHELYES') {
        if (typeof sec.capacity !== 'number' || !Number.isInteger(sec.capacity) || sec.capacity < 1) {
          throw new ApiError('VALIDATION_ERROR', { field: 'sections[' + i + '].capacity', reason: 'standing sector needs integer capacity ≥ 1' });
        }
        await this.prisma.section.create({
          data: { venueId, name: sec.name, kind: sec.kind, capacity: sec.capacity, position: sec.position ?? i },
        });
      } else {
        if (!Array.isArray(sec.rowSeatCounts) || sec.rowSeatCounts.length === 0) {
          throw new ApiError('VALIDATION_ERROR', { field: 'sections[' + i + '].rowSeatCounts', reason: 'seated sector needs at least one row' });
        }
        if (sec.rowSeatCounts.some((c) => !Number.isInteger(c) || c < 1)) {
          throw new ApiError('VALIDATION_ERROR', { field: 'sections[' + i + '].rowSeatCounts', reason: 'each row needs ≥ 1 seat' });
        }
        const created = await this.prisma.section.create({
          data: { venueId, name: sec.name, kind: sec.kind, position: sec.position ?? i },
        });
        const labels = sec.rowLabels && sec.rowLabels.length === sec.rowSeatCounts.length
          ? sec.rowLabels
          : sec.rowSeatCounts.map((_, r) => rowLabel(r));
        for (let r = 0; r < sec.rowSeatCounts.length; r++) {
          const row = await this.prisma.row.create({
            data: { sectionId: created.id, label: labels[r], position: r },
          });
          for (let n = 1; n <= sec.rowSeatCounts[r]; n++) {
            await this.prisma.seat.create({
              data: { rowId: row.id, number: n, label: labels[r] + n },
            });
          }
        }
      }
    }
    await this.recomputeCapacity(venueId);
  }

  async list(activeOnly: boolean) {
    const where: Prisma.VenueWhereInput = activeOnly ? { isActive: true } : {};
    return this.prisma.venue.findMany({
      where,
      include: { sections: { orderBy: { position: 'asc' } } },
      orderBy: { id: 'asc' },
    });
  }

  async get(id: number) {
    const venue = await this.prisma.venue.findUnique({
      where: { id },
      include: {
        sections: {
          orderBy: { position: 'asc' },
          include: {
            rows: { orderBy: { position: 'asc' }, include: { seats: { orderBy: { number: 'asc' } } } },
          },
        },
      },
    });
    if (!venue) throw new ApiError('NOT_FOUND');
    return venue;
  }
}
