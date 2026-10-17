import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { MockPspService } from './mock-psp.service';
import { EmailModule } from '../notifications/notifications.module';

@Module({
  imports: [EmailModule],
  controllers: [PaymentsController],
  providers: [PaymentsService, MockPspService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
