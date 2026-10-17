// Admin backoffice REST surface (JGY-75..88, FR-801..FR-814).
// Route groups:
//   /api/events            — create (POST); backoffice list is GET /api/admin/events
//   /api/events/:id        — patch, publish, pause, resume, delete, stats
//   /api/admin/users       — list/search, role change, activate/deactivate
//   /api/admin/bookings    — list with filters
//   /api/bookings/:id/backoffice — an extended booking detail view
//   /api/admin/refunds     — refunds list (FR-814)
import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express-serve-static-core';
import { JwtAuthGuard, Roles } from '../auth/guards';
import { AdminService } from './admin.service';
import { ApiError } from '../common/errors/api-error';

interface AuthedRequest extends Request {
  user?: { id: number; role: string };
}

function me(req: AuthedRequest): { id: number; role: string } {
  if (req.user === undefined) throw new ApiError('UNAUTHENTICATED');
  return req.user;
}

function numParam(raw: string, field = 'id'): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) throw new ApiError('VALIDATION_ERROR', { field, reason: 'positive integer' });
  return n;
}

@ApiTags('events')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  // ------------------------------------------------------------- JGY-75
  @Post('events')
  @Roles('ADMIN', 'SZERVEZO')
  @ApiOperation({ summary: 'Create an event (PISZKOZAT, organizer=current user)' })
  createEvent(@Req() req: AuthedRequest, @Body() body: Record<string, unknown>) {
    const u = me(req);
    return this.admin.createEvent(u.id, u.role, body as never);
  }

  // ------------------------------------------------------------- JGY-80
  @Get('admin/events')
  @Roles('ADMIN', 'SZERVEZO')
  @ApiOperation({ summary: 'Backoffice event list (BR-20: SZERVEZO sees own only). Filters: status, venueId, organizerUserId, dateFrom, dateTo.' })
  listEvents(@Req() req: AuthedRequest, @Query() q: Record<string, string | undefined>) {
    const u = me(req);
    return this.admin.listEvents(u.role, u.id, {
      status: q.status,
      venueId: q.venueId !== undefined ? Number(q.venueId) : undefined,
      organizerUserId: q.organizerUserId !== undefined ? Number(q.organizerUserId) : undefined,
      dateFrom: q.dateFrom,
      dateTo: q.dateTo,
    });
  }

  // ------------------------------------------------------------- JGY-76
  @Patch('events/:id')
  @Roles('ADMIN', 'SZERVEZO')
  @ApiOperation({ summary: 'Edit event data / sales window (BR-11, FR-813 ownership)' })
  updateEvent(@Req() req: AuthedRequest, @Param('id') id: string, @Body() body: Record<string, unknown>) {
    const u = me(req);
    return this.admin.updateEvent(u.id, u.role, numParam(id), body as never);
  }

  // ------------------------------------------------------------- JGY-77
  @Post('events/:id/publish')
  @Roles('ADMIN', 'SZERVEZO')
  @ApiOperation({ summary: 'Publish a PISZKOZAT event (BR-19 validation, seat states SZABAD)' })
  publish(@Req() req: AuthedRequest, @Param('id') id: string) {
    const u = me(req);
    return this.admin.publishEvent(u.id, u.role, numParam(id));
  }

  // ------------------------------------------------------------- JGY-78
  @Post('events/:id/sales/pause')
  @Roles('ADMIN', 'SZERVEZO')
  @ApiOperation({ summary: 'PUBLIKALT → ERTEKESITES_SZUNETELT' })
  pause(@Req() req: AuthedRequest, @Param('id') id: string) {
    const u = me(req);
    return this.admin.pauseSales(u.id, u.role, numParam(id));
  }

  @Post('events/:id/sales/resume')
  @Roles('ADMIN', 'SZERVEZO')
  @ApiOperation({ summary: 'ERTEKESITES_SZUNETELT → PUBLIKALT' })
  resume(@Req() req: AuthedRequest, @Param('id') id: string) {
    const u = me(req);
    return this.admin.resumeSales(u.id, u.role, numParam(id));
  }

  // ------------------------------------------------------------- JGY-79
  @Delete('events/:id')
  @Roles('ADMIN', 'SZERVEZO')
  @ApiOperation({ summary: 'Delete a PISZKOZAT event (transactional)' })
  remove(@Req() req: AuthedRequest, @Param('id') id: string) {
    const u = me(req);
    return this.admin.deleteEvent(u.id, u.role, numParam(id));
  }
  // ------------------------------------------------------------- JGY-90..96
  @Post('events/:id/cancel')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Cancel a PUBLIKALT / ERTEKESITES_SZUNETELT event: refunds paid bookings, revokes tickets (admin only, FR-901..FR-907).' })
  cancel(@Req() req: AuthedRequest, @Param('id') id: string) {
    const u = me(req);
    return this.admin.cancelEvent(u, numParam(id));
  }

  // ------------------------------------------------------------- JGY-86
  @Get('events/:id/statistics')
  @Roles('ADMIN', 'SZERVEZO')
  @ApiOperation({ summary: 'Sold ticket count, revenue, utilization % (FR-812)' })
  statistics(@Req() req: AuthedRequest, @Param('id') id: string) {
    const u = me(req);
    return this.admin.eventStatistics(u.id, u.role, numParam(id));
  }

  // -------------------------------------------------------- JGY-85 (ext)
  @Get('bookings/:id/backoffice')
  @Roles('ADMIN', 'SZERVEZO', 'VASARLO')
  @ApiOperation({ summary: 'Extended booking detail: items, totals, payments, tickets, refund (BR-20)' })
  bookingBackoffice(@Req() req: AuthedRequest, @Param('id') id: string) {
    const u = me(req);
    return this.admin.bookingDetail(u.id, u.role, numParam(id));
  }
}

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('admin')
export class AdminQueriesController {
  constructor(private readonly admin: AdminService) {}

  // ------------------------------------------------------------- JGY-81
  @Get('users')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'List users / search by email or name (case-insensitive; no password fields)' })
  users(@Req() req: AuthedRequest, @Query('search') search: string | undefined) {
    const u = me(req);
    return this.admin.listUsers(u.role, search);
  }

  // ------------------------------------------------------------- JGY-82
  @Patch('users/:id/role')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Change a user role (single-admin demotion protected)' })
  setRole(@Req() req: AuthedRequest, @Param('id') id: string, @Body() body: { role?: string }) {
    const u = me(req);
    return this.admin.setUserRole(u, numParam(id), body.role as string);
  }

  // ------------------------------------------------------------- JGY-83
  @Patch('users/:id/active')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Activate/deactivate a user (BR-21: refresh tokens revoked on deactivation)' })
  setActive(@Req() req: AuthedRequest, @Param('id') id: string, @Body() body: { isActive?: boolean }) {
    const u = me(req);
    if (typeof body.isActive !== 'boolean') {
      throw new ApiError('VALIDATION_ERROR', { field: 'isActive', reason: 'boolean required' });
    }
    return this.admin.setUserActive(u, numParam(id), body.isActive);
  }

  // ------------------------------------------------------------- JGY-84
  @Get('bookings')
  @Roles('ADMIN', 'SZERVEZO')
  @ApiOperation({ summary: 'Bookings list with filters (BR-20 scope by role). Filters: eventId, status, dateFrom, dateTo.' })
  bookings(@Req() req: AuthedRequest, @Query() q: Record<string, string | undefined>) {
    const u = me(req);
    return this.admin.listBookings(u.id, u.role, {
      eventId: q.eventId !== undefined ? Number(q.eventId) : undefined,
      status: q.status,
      dateFrom: q.dateFrom,
      dateTo: q.dateTo,
    });
  }

  // ------------------------------------------------------------- JGY-88
  @Get('refunds')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Refunds list, admin only. Filters: status, eventId, dateFrom, dateTo.' })
  refunds(@Req() req: AuthedRequest, @Query() q: Record<string, string | undefined>) {
    const u = me(req);
    return this.admin.listRefunds(u.role, {
      status: q.status,
      eventId: q.eventId !== undefined ? Number(q.eventId) : undefined,
      dateFrom: q.dateFrom,
      dateTo: q.dateTo,
    });
  }
}
