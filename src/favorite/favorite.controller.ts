import { Body, Controller, Param, Post, Req } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { type Request } from 'express';

import { FavoriteService } from './favorite.service';

import { Auth } from '@/common/decorators/auth.decorator';

@Controller('favorit-doctor')
export class FavoriteController {
  constructor(
    private readonly favoriteService: FavoriteService,
    private readonly jwtService: JwtService,
  ) {}

  @Auth()
  @Post(':doctorID')
  async addFavoritDoctor(
    @Req() req: Request,
    @Param('doctorID') doctorID: string,
  ) {
    const userID = req.credentials.user.id;

    await this.favoriteService.addFavoritDoctor(userID, doctorID);
  }
}
