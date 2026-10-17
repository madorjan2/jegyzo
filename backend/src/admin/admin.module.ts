import { Module } from '@nestjs/common';
import { AdminController, AdminQueriesController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  controllers: [AdminController, AdminQueriesController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}
