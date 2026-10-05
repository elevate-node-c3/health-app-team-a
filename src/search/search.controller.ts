import { Controller, Delete, Get, Query, Req } from '@nestjs/common';
import { type Request } from 'express';
import { OptionalAuth } from 'src/common/decorators/auth.decorator';

import { MapSearchQueryDto } from './dto/map-search-query.dto';
import { SearchQueryDto } from './dto/search-query.dto';
import { SearchService } from './search.service';

import type { SearchIdentity } from './search.service';

@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @OptionalAuth()
  @Get('suggestions')
  async suggestions(@Query() dto: SearchQueryDto) {
    return {
      suggestions: await this.searchService.suggestions(dto.query || ''),
    };
  }

  @OptionalAuth()
  @Get()
  async search(@Query() dto: SearchQueryDto, @Req() req: Request) {
    return this.searchService.search(dto, this.identity(req));
  }

  @OptionalAuth()
  @Get('map')
  async map(@Query() dto: MapSearchQueryDto, @Req() req: Request) {
    return this.searchService.searchMap(dto, this.identity(req));
  }

  @OptionalAuth()
  @Get('history')
  async history(@Req() req: Request) {
    return {
      history: await this.searchService.history(this.identity(req)),
    };
  }

  @OptionalAuth()
  @Delete('history')
  async clearHistory(@Req() req: Request) {
    await this.searchService.clearHistory(this.identity(req));
    return { message: 'Search history cleared successfully' };
  }

  // `req.deviceId` is assigned by `AuthenticationGuard` for every request
  // this controller handles, since all routes here are `@OptionalAuth()`.
  private identity(req: Request): SearchIdentity {
    const userId = req.credentials?.user?.id;
    return userId
      ? { deviceId: req.deviceId!, userId }
      : { deviceId: req.deviceId! };
  }
}
