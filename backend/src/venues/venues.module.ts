import { Module } from '@nestjs/common';
import { VenuesController, SeatMapController } from './venues.controller';
import { VenuesService } from './venues.service';

@Module({
  controllers: [VenuesController, SeatMapController],
  providers: [VenuesService],
  exports: [VenuesService],
})
export class VenuesModule {}
