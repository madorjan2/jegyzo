import { Global, Module } from '@nestjs/common';
import { EmailService } from './notifications.service';

@Global()
@Module({
  providers: [EmailService],
  exports: [EmailService],
})
export class EmailModule {}
