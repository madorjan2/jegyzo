import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { EventsService } from './events.service';
import { ApiError } from '../common/errors/api-error';

@ApiTags('events')
@Controller('events')
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @Get()
  @ApiOperation({ summary: 'Public event catalogue (list + search + filter + sort + paging)' })
  list(@Query() query: Record<string, string | undefined>) {
    const q: Parameters<EventsService['list']>[0] = {};

    if (query.search) q.search = query.search;
    if (query.category) {
      q.category = query.category.split(',');
      const bad = q.category.filter((c) => !['KONCERT', 'SZINHAZ', 'SPORT', 'FESZTIVAL', 'EGYEB'].includes(c));
      if (bad.length) throw new ApiError('VALIDATION_ERROR', { field: 'category', reason: `invalid: ${bad.join(',')}` });
    }
    if (query.city) q.city = query.city.split(',');
    if (query.venueId) {
      q.venueId = query.venueId.split(',').map((v) => Number(v));
      if (q.venueId.some((v) => !Number.isInteger(v) || v <= 0)) {
        throw new ApiError('VALIDATION_ERROR', { field: 'venueId', reason: 'must be integer ids' });
      }
    }
    if (query.dateFrom) q.dateFrom = query.dateFrom;
    if (query.dateTo) q.dateTo = query.dateTo;
    if (query.priceMin !== undefined) {
      q.priceMin = Number(query.priceMin);
      if (!Number.isInteger(q.priceMin) || q.priceMin < 0) throw new ApiError('VALIDATION_ERROR', { field: 'priceMin' });
    }
    if (query.priceMax !== undefined) {
      q.priceMax = Number(query.priceMax);
      if (!Number.isInteger(q.priceMax) || q.priceMax < 0) throw new ApiError('VALIDATION_ERROR', { field: 'priceMax' });
    }
    if (query.hasFreeSeats !== undefined) q.hasFreeSeats = query.hasFreeSeats === 'true' || query.hasFreeSeats === '1';
    if (query.sort) {
      if (!['startsAt', 'price', 'popularity'].includes(query.sort)) {
        throw new ApiError('VALIDATION_ERROR', { field: 'sort', reason: 'invalid sort key' });
      }
      q.sort = query.sort;
    }
    if (query.order) {
      if (!['asc', 'desc'].includes(query.order)) throw new ApiError('VALIDATION_ERROR', { field: 'order' });
      q.order = query.order;
    }
    if (query.page !== undefined) {
      q.page = Number(query.page);
      if (!Number.isInteger(q.page) || q.page < 1) throw new ApiError('VALIDATION_ERROR', { field: 'page' });
    }
    if (query.pageSize !== undefined) {
      q.pageSize = Number(query.pageSize);
      if (![12, 24, 48].includes(q.pageSize)) throw new ApiError('VALIDATION_ERROR', { field: 'pageSize', reason: 'must be 12/24/48' });
    }

    return this.events.list(q);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Event details, public' })
  details(@Param('id') id: string) {
    const num = Number(id);
    if (!Number.isInteger(num) || num <= 0) {
      throw new ApiError('VALIDATION_ERROR', { field: 'id', reason: 'must be a positive integer' });
    }
    return this.events.details(num);
  }
}
