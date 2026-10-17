// Booking REST surface. Purchase, cancel, own-bookings list, detail by id.
import { Body, Controller, Get, HttpCode, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express-serve-static-core';
import { JwtAuthGuard, Roles } from '../auth/guards';
import { BookingsService } from './bookings.service';
import { ApiError } from '../common/errors/api-error';

interface AuthedRequest extends Request {
  user?: { id: number; role: string };
}

interface BookingItemPayload {
  seatId?: number;
  ticketTypeId?: number;
  quantity?: number;
}

@ApiTags('bookings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('bookings')
export class BookingsController {
  constructor(private readonly bookings: BookingsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a booking: seat items ({seatId, ticketTypeId}) or standing ({ticketTypeId, quantity}).' })
  async create(@Req() req: AuthedRequest, @Body() body: { eventId?: number; items?: BookingItemPayload[] }) {
    if (req.user === undefined) throw new ApiError('UNAUTHENTICATED');
    const eventId = body.eventId ?? undefined;
    if (typeof eventId !== 'number' || !Number.isInteger(eventId) || eventId <= 0) {
      throw new ApiError('VALIDATION_ERROR', { field: 'eventId' });
    }
    const items = body.items ?? [];
    const normalized: Parameters<BookingsService['create']>[2] = [];
    for (const it of items) {
      if (typeof it.ticketTypeId !== 'number' || !Number.isInteger(it.ticketTypeId) || it.ticketTypeId <= 0) {
        throw new ApiError('VALIDATION_ERROR', { field: 'items.ticketTypeId' });
      }
      if (typeof it.seatId === 'number') {
        normalized.push({ seatId: it.seatId, ticketTypeId: it.ticketTypeId });
      } else if (typeof it.quantity === 'number') {
        normalized.push({ ticketTypeId: it.ticketTypeId, quantity: it.quantity });
      } else {
        throw new ApiError('VALIDATION_ERROR', { field: 'items', reason: 'each item needs seatId or quantity' });
      }
    }
    return this.bookings.create(req.user.id, eventId, normalized);
  }

  @Get()
  @ApiOperation({ summary: 'My bookings (owner only)' })
  list(@Req() req: AuthedRequest) {
    if (req.user === undefined) throw new ApiError('UNAUTHENTICATED');
    return this.bookings.listOwn(req.user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Booking detail — owner or ADMIN only (BR-20)' })
  detail(@Req() req: AuthedRequest, @Param('id') id: string) {
    if (req.user === undefined) throw new ApiError('UNAUTHENTICATED');
    const num = Number(id);
    if (!Number.isInteger(num) || num <= 0) throw new ApiError('VALIDATION_ERROR', { field: 'id' });
    return this.bookings.detail(req.user.id, req.user.role, num);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @ApiOperation({ summary: 'Cancel a pending booking before payment (owner or ADMIN)' })
  cancel(@Req() req: AuthedRequest, @Param('id') id: string) {
    if (req.user === undefined) throw new ApiError('UNAUTHENTICATED');
    const num = Number(id);
    if (!Number.isInteger(num) || num <= 0) throw new ApiError('VALIDATION_ERROR', { field: 'id' });
    return this.bookings.cancel(req.user.id, req.user.role, num);
  }
}
