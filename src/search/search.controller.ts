import { randomUUID } from 'crypto';

import { Controller, Delete, Get, Query, Req, Res } from '@nestjs/common';
import { type Request, type Response } from 'express';
import { OptionalAuth } from 'src/common/decorators/auth.decorator';
import {
  SEARCH_DEVICE_COOKIE,
  SEARCH_DEVICE_COOKIE_OPTION,
} from 'src/config/cookie';

import { SearchQueryDto } from './dto/search-query.dto';
import { SearchService } from './search.service';

import type { SearchIdentity } from './search.service';

@Controller('doctors/search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @OptionalAuth()
  @Get('suggestions')
  async suggestions(
    @Query() dto: SearchQueryDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.setDeviceCookie(req, res);
    return {
      suggestions: await this.searchService.suggestions(dto.query || ''),
    };
  }

  @OptionalAuth()
  @Get()
  async search(
    @Query() dto: SearchQueryDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.searchService.search(dto, this.identity(req, res));
  }

  @OptionalAuth()
  @Get('history')
  async history(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return {
      history: await this.searchService.history(this.identity(req, res)),
    };
  }

  @OptionalAuth()
  @Delete('history')
  async clearHistory(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.searchService.clearHistory(this.identity(req, res));
    return { message: 'Search history cleared successfully' };
  }

  private identity(req: Request, res: Response): SearchIdentity {
    const deviceId = this.setDeviceCookie(req, res);
    const userId = req.credentials?.user?.id;
    return userId ? { deviceId, userId } : { deviceId };
  }

  private setDeviceCookie(req: Request, res: Response): string {
    const current = req.cookies?.[SEARCH_DEVICE_COOKIE] as string | undefined;
    const deviceId =
      current && /^[0-9a-f-]{36}$/i.test(current) ? current : randomUUID();

    if (deviceId !== current)
      res.cookie(SEARCH_DEVICE_COOKIE, deviceId, SEARCH_DEVICE_COOKIE_OPTION);

    return deviceId;
  }
}
