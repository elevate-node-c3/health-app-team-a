import { Controller, Get, Req } from '@nestjs/common';
import { type Request } from 'express';
import { OptionalAuth } from 'src/common/decorators/auth.decorator';

import { HomeService } from './home.service';

@Controller('home')
export class HomeController {
  constructor(private readonly homeService: HomeService) {}

  @OptionalAuth()
  @Get()
  async getHome(@Req() req: Request) {
    const user = req.credentials?.user ?? null;
    return await this.homeService.getHome(user);
  }
}
