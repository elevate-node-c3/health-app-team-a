import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { type Request, type Response } from 'express';
import { Verified } from 'src/common/decorators/auth.decorator';

import { AppointmentBookingService } from './appointment-booking.service';
import { AppointmentHistoryService } from './appointment-history.service';
import { AppointmentHistoryQueryDto } from './dto/appointment-history-query.dto';
import { CreateBookingHoldDto } from './dto/create-booking-hold.dto';
import { CreateReplacementHoldDto } from './dto/create-replacement-hold.dto';

@Verified()
@Controller('appointments')
export class AppointmentController {
  constructor(
    private readonly appointmentBookingService: AppointmentBookingService,
    private readonly appointmentHistoryService: AppointmentHistoryService,
  ) {}

  @Get()
  list(@Query() query: AppointmentHistoryQueryDto, @Req() req: Request) {
    return this.appointmentHistoryService.list(req.credentials.user.id, query);
  }

  @Post(':id/cancel')
  cancel(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    return this.appointmentHistoryService.cancel(req.credentials.user.id, id);
  }

  @Post(':id/reschedule/holds')
  reschedule(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateReplacementHoldDto,
    @Req() req: Request,
  ) {
    return this.appointmentBookingService.createReplacementHold(
      req.credentials.user.id,
      id,
      dto.scheduledAt,
      'reschedule',
    );
  }

  @Post(':id/rebook/holds')
  rebook(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateReplacementHoldDto,
    @Req() req: Request,
  ) {
    return this.appointmentBookingService.createReplacementHold(
      req.credentials.user.id,
      id,
      dto.scheduledAt,
      'rebook',
    );
  }

  @Get(':id/prescription')
  prescriptionLink(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    return this.appointmentHistoryService.prescriptionLink(
      req.credentials.user.id,
      id,
    );
  }

  @Get(':id/prescription/download')
  async downloadPrescription(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('expiresAt') expiresAt: string,
    @Query('signature') signature: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const path = await this.appointmentHistoryService.prescriptionFile(
      req.credentials.user.id,
      id,
      Number(expiresAt),
      signature,
    );
    res.type('application/pdf').download(path);
  }

  @Post('holds')
  createHold(@Body() dto: CreateBookingHoldDto, @Req() req: Request) {
    return this.appointmentBookingService.createHold(
      req.credentials.user.id,
      dto,
    );
  }
}
