import { Module } from '@nestjs/common';
import { PrismaModule } from './db/prisma.module';
import { AuthModule } from './auth/auth.module';
import { EventsModule } from './events/events.module';
import { VenuesModule } from './venues/venues.module';
import { TicketsModule } from './tickets/tickets.module';
import { BookingsModule } from './bookings/bookings.module';
import { PaymentsModule } from './payments/payments.module';
import { HealthController } from './health/health.controller';
import { AdminModule } from './admin/admin.module';
@Module({
  imports: [PrismaModule, AuthModule, EventsModule, VenuesModule, TicketsModule, BookingsModule, PaymentsModule, AdminModule],
  providers: [],
})
export class AppModule {}
