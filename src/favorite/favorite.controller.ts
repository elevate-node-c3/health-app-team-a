import { Body, Controller, Param, Post, Req } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { type Request } from 'express';

import { FavoriteDoctorDTO } from './dto/favorite-doctor.dto';
import { FavoriteService } from './favorite.service';

import { Auth, GuestAuth } from '@/common/decorators/auth.decorator';

@Controller('favorit-doctor')
export class FavoriteController {
  constructor(
    private readonly favoriteService: FavoriteService,
    private readonly jwtService: JwtService,
  ) {}

  @GuestAuth()
  @Auth()
  @Post(':doctorID')
  async addFavoritDoctor(
    @Req() req: Request,
    @Param('doctorID') doctorID: string,
    @Body() dto: FavoriteDoctorDTO,
  ) {
    const { id } = req.credentials.user;
    dto.doctorID = doctorID;
    dto.userID = id;

    await this.favoriteService.addFavoritDoctor(dto);
  }
}
