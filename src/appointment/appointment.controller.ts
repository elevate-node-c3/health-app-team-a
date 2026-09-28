import { Body, Controller, Post, Req } from '@nestjs/common';
import { type Request } from 'express';
import { Auth } from 'src/common/decorators/auth.decorator';

import { AppointmentBookingService } from './appointment-booking.service';
import { CreateBookingHoldDto } from './dto/create-booking-hold.dto';

@Auth()
@Controller('appointments')
export class AppointmentController {
  constructor(
    private readonly appointmentBookingService: AppointmentBookingService,
  ) {}

  @Post('holds')
  createHold(@Body() dto: CreateBookingHoldDto, @Req() req: Request) {
    return this.appointmentBookingService.createHold(
      req.credentials.user.id,
      dto,
    );
  }
}
