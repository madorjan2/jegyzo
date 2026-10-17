// Venue + seating-map controllers.
// Writes are ADMIN only (NFR-16, FR-301); reads are public for catalogue use.
import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard, Roles } from '../auth/guards';
import { VenuesService } from './venues.service';
import { ApiError } from '../common/errors/api-error';
import { PrismaService } from '../db/prisma.service';
import { SectionKind, SeatStateEnum } from '@prisma/client';

interface SectionPayload {
  name: string;
  kind: string;
  rowSeatCounts?: number[];
  rowLabels?: string[];
  capacity?: number;
  position?: number;
}

@ApiTags('venues')
@Controller('venues')
export class VenuesController {
  constructor(
    private readonly venues: VenuesService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List venues (public: active only; admin: with ?all=true)' })
  list(@Query('all') all: string | undefined) {
    return this.venues.list(all === 'true' || all === '1');
  }

  @Get(':id')
  @ApiOperation({ summary: 'Venue details with sections, rows and seats' })
  async get(@Param('id') id: string) {
    const num = Number(id);
    if (!Number.isInteger(num) || num <= 0) throw new ApiError('VALIDATION_ERROR', { field: 'id' });
    return this.venues.get(num);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a venue (admin)' })
  create(@Body() body: { venue?: Record<string, unknown>; sections?: SectionPayload[] }) {
    const dto = (body.venue ?? {}) as Record<string, unknown>;
    return this.venues.create(
      {
        name: dto.name as string,
        city: dto.city as string,
        address: dto.address as string,
        description: (dto.description as string | null) ?? null,
        isActive: dto.isActive as boolean | undefined,
      },
      (body.sections ?? []).map((s) => ({
        name: s.name, kind: s.kind as 'ULOHELYES' | 'ALLOHELYES',
        rowSeatCounts: s.rowSeatCounts, rowLabels: s.rowLabels,
        capacity: s.capacity, position: s.position,
      })),
    );
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update name/city/address/description/isActive (admin)' })
  update(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    const num = Number(id);
    if (!Number.isInteger(num) || num <= 0) throw new ApiError('VALIDATION_ERROR', { field: 'id' });
    return this.venues.update(num, body as Record<string, never>);
  }

  @Post(':id/sections')
  @UseGuards(JwtAuthGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Add a sector to the venue (admin). Sitting: rowSeatCounts; standing: capacity.' })
  addSection(@Param('id') id: string, @Body() body: SectionPayload) {
    const num = Number(id);
    if (!Number.isInteger(num) || num <= 0) throw new ApiError('VALIDATION_ERROR', { field: 'id' });
    return this.venues.addSections(num, [{
      name: body.name, kind: body.kind as 'ULOHELYES' | 'ALLOHELYES',
      rowSeatCounts: body.rowSeatCounts, rowLabels: body.rowLabels,
      capacity: body.capacity, position: body.position,
    }]).then(() => this.venues.get(num));
  }
}

@ApiTags('events')
@Controller('events/:eventId/seats')
export class SeatMapController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'Seat map for the event (public). Returns sections with rows/seats + current SeatState.' })
  async seats(@Param('eventId') eventId: string) {
    const id = Number(eventId);
    if (!Number.isInteger(id) || id <= 0) throw new ApiError('VALIDATION_ERROR', { field: 'eventId' });
    const event = await this.prisma.event.findUnique({ where: { id } });
    if (!event) throw new ApiError('EVENT_NOT_FOUND');

    const venue = await this.prisma.venue.findUnique({
      where: { id: event.venueId },
      include: {
        sections: {
          orderBy: { position: 'asc' },
          include: { rows: { orderBy: { position: 'asc' }, include: { seats: { orderBy: { number: 'asc' } } } } },
        },
      },
    });

    const seatIds = (venue?.sections ?? []).flatMap((s) => s.rows.flatMap((r) => r.seats.map((x) => x.id)));
    const states = await this.prisma.seatState.findMany({
      where: { eventId: id, seatId: { in: seatIds.length > 0 ? seatIds : [-1] } },
    });
    const stateBySeat = new Map(states.map((s) => [s.seatId, s]));

    const sections = (venue?.sections ?? []).map((s) => ({
      id: s.id, name: s.name, kind: s.kind, capacity: s.capacity, position: s.position,
      rows: s.rows.map((r) => ({
        id: r.id, label: r.label, position: r.position,
        seats: r.seats.map((x) => ({
          id: x.id, number: x.number, label: x.label,
          state: stateBySeat.get(x.id)?.state ?? SeatStateEnum.SZABAD,
        })),
      })),
    }));

    // A standing-only venue has no seat-level sections to show (FR-304).
    const hasSeats = (venue?.sections ?? []).some((s) => s.kind === 'ULOHELYES');
    return { eventId: id, hasSeatMap: hasSeats, sections: hasSeats ? sections : [] };
  }
}
