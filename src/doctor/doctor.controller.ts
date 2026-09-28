import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  Req,
} from '@nestjs/common';
import { OptionalAuth } from 'src/common/decorators/auth.decorator';

import { DoctorService } from './doctor.service';
import { AvailabilityQueryDto } from './dto/availability-query.dto';

import type { Request } from 'express';

@Controller('doctors')
export class DoctorController {
  constructor(private readonly doctorService: DoctorService) {}

  /**
   * Guests may browse a doctor, the same as search and home allow. A signed-in
   * user additionally gets `isFavourite`.
   */
  @Get(':id')
  @OptionalAuth()
  async profile(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    return this.doctorService.getProfile(id, req.credentials?.user ?? null);
  }

  @Get(':id/availability')
  @OptionalAuth()
  async availability(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() dto: AvailabilityQueryDto,
  ) {
    return this.doctorService.getAvailability(id, dto);
  }
}
