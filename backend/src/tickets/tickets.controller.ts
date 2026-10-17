// Ticket REST surface: PDF download (owner/admin) + public validity endpoint.
import { Controller, Get, Param, Res, UseGuards, Req } from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards';
import { TicketsService } from './tickets-pdf.service';
import { PrismaService } from '../db/prisma.service';
import { ApiError } from '../common/errors/api-error';

interface AuthedRequest {
  user?: { id: number; role: string };
}
@Controller('tickets')
export class TicketsController {
  constructor(
    private readonly ticketsService: TicketsService,
    private readonly prisma: PrismaService,
  ) {}

  /** GET /api/tickets/:code/pdf — owner or ADMIN (BR-20). */
  @Get(':code/pdf')
  @UseGuards(JwtAuthGuard)
  async pdf(@Param('code') code: string, @Res() res: Response, @Req() req: AuthedRequest) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { code },
      include: { booking: true },
    });
    if (!ticket) throw new ApiError('TICKET_NOT_FOUND');
    if (req.user && req.user.id !== ticket.booking.userId && req.user.role !== 'ADMIN') {
      throw new ApiError('FORBIDDEN');
    }
    const pdf = await this.ticketsService.renderPdf(code);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="jegy-${code}.pdf"`);
    res.send(pdf);
  }

  /** GET /api/tickets/:code/validate — public validity endpoint (FR-706). */
  @Get(':code/validate')
  async validate(@Param('code') code: string) {
    return this.ticketsService.validate(code);
  }
}
