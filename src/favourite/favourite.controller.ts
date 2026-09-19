import {
  Controller,
  Delete,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common';
import { type Request } from 'express';
import { Auth } from 'src/common/decorators/auth.decorator';

import { FavouriteService } from './favourite.service';

@Auth()
@Controller('favourites')
export class FavouriteController {
  constructor(private readonly favouriteService: FavouriteService) {}

  @Post(':doctorId')
  async add(
    @Param('doctorId', ParseUUIDPipe) doctorId: string,
    @Req() req: Request,
  ) {
    return this.favouriteService.add(req.credentials.user.id, doctorId);
  }

  @Delete(':doctorId')
  async remove(
    @Param('doctorId', ParseUUIDPipe) doctorId: string,
    @Req() req: Request,
  ) {
    return this.favouriteService.remove(req.credentials.user.id, doctorId);
  }
}
