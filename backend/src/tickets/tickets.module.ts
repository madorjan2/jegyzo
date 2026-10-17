import { Module } from '@nestjs/common';
import { TicketsController } from './tickets.controller';
import { TicketTypesController } from './ticket-types.controller';
import { TicketTypesService } from './ticket-types.service';
import { TicketsService } from './tickets-pdf.service';

@Module({
  controllers: [TicketsController, TicketTypesController],
  providers: [TicketsService, TicketTypesService],
  exports: [TicketsService, TicketTypesService],
})
export class TicketsModule {}
