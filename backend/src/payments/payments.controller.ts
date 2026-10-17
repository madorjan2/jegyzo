import { Body, Controller, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express-serve-static-core';
import { JwtAuthGuard } from '../auth/guards';
import { PaymentsService } from './payments.service';
import { ApiError } from '../common/errors/api-error';

interface AuthedRequest extends Request {
  user?: { id: number; role: string };
}

interface PayPayload {
  cardNumber?: string;
  expiry?: string;
  cvc?: string;
  idempotencyKey?: string;
}

@ApiTags('payments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('bookings')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post(':id/payment/initiate')
  @ApiOperation({ summary: 'Initiate payment: validates the card, ZAROLT → FIZETESRE_VAR.' })
  async initiate(@Req() req: AuthedRequest, @Param('id') id: string, @Body() body: PayPayload) {
    if (req.user === undefined) throw new ApiError('UNAUTHENTICATED');
    const num = Number(id);
    if (!Number.isInteger(num) || num <= 0) throw new ApiError('VALIDATION_ERROR', { field: 'id' });
    return this.payments.initiate(req.user.id, req.user.role, num, {
      cardNumber: body.cardNumber ?? '',
      expiry: body.expiry ?? '',
      cvc: body.cvc ?? '',
    });
  }

  @Post(':id/payment')
  @ApiOperation({ summary: 'Process a payment attempt (mock PSP, idempotencyKey required).' })
  async process(@Req() req: AuthedRequest, @Param('id') id: string, @Body() body: PayPayload) {
    if (req.user === undefined) throw new ApiError('UNAUTHENTICATED');
    const num = Number(id);
    if (!Number.isInteger(num) || num <= 0) throw new ApiError('VALIDATION_ERROR', { field: 'id' });
    return this.payments.process(req.user.id, req.user.role, num, {
      cardNumber: body.cardNumber ?? '',
      expiry: body.expiry ?? '',
      cvc: body.cvc ?? '',
    }, body.idempotencyKey);
  }
}
