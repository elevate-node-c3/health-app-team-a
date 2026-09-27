import {
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { type Request, type Response } from 'express';
import { Auth } from 'src/common/decorators/auth.decorator';

import { CreateSlotHoldDto } from './dto/create-slot-hold.dto';
import { SlotHoldService } from './slot-hold.service';

@Auth()
@Controller('slot-holds')
export class SlotHoldController {
  constructor(private readonly slotHoldService: SlotHoldService) {}

  @Post()
  async hold(
    @Body() dto: CreateSlotHoldDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { created, hold } = await this.slotHoldService.hold(
      req.credentials.user,
      dto,
    );
    res.status(created ? HttpStatus.CREATED : HttpStatus.OK);
    return hold;
  }

  @Get(':id')
  async get(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    return this.slotHoldService.get(req.credentials.user.id, id);
  }

  @Patch(':id/extend')
  async extend(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    return this.slotHoldService.extend(req.credentials.user.id, id);
  }

  @Delete(':id')
  async release(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    return this.slotHoldService.release(req.credentials.user.id, id);
  }
}
