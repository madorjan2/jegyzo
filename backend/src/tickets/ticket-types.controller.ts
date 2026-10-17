// Ticket-type REST surface.
// Writes: ADMIN or SZERVEZO (they own the event); reads public.
// (E5 focuses on ticket-type rules; the event-creation endpoint arrives with E9.)
import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard, Roles } from '../auth/guards';
import { TicketTypesService } from './ticket-types.service';
import { ApiError } from '../common/errors/api-error';
import { PrismaService } from '../db/prisma.service';

interface TicketTypePayload {
  name?: string;
  price?: number;
  capacity?: number | null;
  maxPerUser?: number;
  salesStartAt?: string | null;
  salesEndAt?: string | null;
  isActive?: boolean;
}

@ApiTags('events')
@Controller('events/:eventId/tickets')
export class TicketTypesController {
  constructor(
    private readonly ticketTypes: TicketTypesService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List ticket types for the event (public)' })
  list(@Param('eventId') eventId: string) {
    const id = Number(eventId);
    if (!Number.isInteger(id) || id <= 0) throw new ApiError('VALIDATION_ERROR', { field: 'eventId' });
    return this.ticketTypes.list(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @Roles('ADMIN', 'SZERVEZO')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a ticket type for the event+section (admin/szervező)' })
  async create(
    @Param('eventId') eventId: string,
    @Body() body: TicketTypePayload & { sectionId?: number },
  ) {
    const id = Number(eventId);
    if (!Number.isInteger(id) || id <= 0) throw new ApiError('VALIDATION_ERROR', { field: 'eventId' });
    if (typeof body.sectionId !== 'number' || !Number.isInteger(body.sectionId) || body.sectionId <= 0) {
      throw new ApiError('VALIDATION_ERROR', { field: 'sectionId' });
    }
    return this.ticketTypes.create(id, body.sectionId, {
      name: body.name as string,
      price: body.price as number,
      capacity: body.capacity ?? null,
      maxPerUser: body.maxPerUser,
      salesStartAt: body.salesStartAt ?? null,
      salesEndAt: body.salesEndAt ?? null,
      isActive: body.isActive,
    });
  }

  @Patch(':ticketTypeId')
  @UseGuards(JwtAuthGuard)
  @Roles('ADMIN', 'SZERVEZO')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update price/capacity/maxPerUser/sales window/isActive (admin/szervező)' })
  update(
    @Param('eventId') eventId: string,
    @Param('ticketTypeId') ticketTypeId: string,
    @Body() body: TicketTypePayload,
  ) {
    const ttId = Number(ticketTypeId);
    if (!Number.isInteger(ttId) || ttId <= 0) throw new ApiError('VALIDATION_ERROR', { field: 'ticketTypeId' });
    return this.ticketTypes.update(ttId, body);
  }
}
