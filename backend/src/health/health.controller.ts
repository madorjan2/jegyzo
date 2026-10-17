import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../db/prisma.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'API and database health' })
  @ApiResponse({ status: 200, description: 'OK' })
  @ApiResponse({ status: 503, description: 'Database unreachable' })
  async check() {
    let db = 'ok';
    let httpStatus = 200;
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      db = 'unavailable';
      httpStatus = 503;
    }
    return { status: db === 'ok' ? 'ok' : 'degraded', api: 'ok', db };
  }
}
