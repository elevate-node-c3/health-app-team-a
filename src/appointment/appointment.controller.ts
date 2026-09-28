import { Controller, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import { type Request } from 'express';

import { AppointmentService } from './appointment.service';
import { Appointment } from './domain/entities/appointment.model';

import { Auth } from '@/common/decorators/auth.decorator';

@Controller('appointment')
export class AppointmentController {
  constructor(private readonly appointmentService: AppointmentService) {}
  @Auth()
  @Post('/booking:slotId')
  async createBooking(
    @Param('slotId', ParseUUIDPipe) slotId: string,
    @Req() req: Request,
  ): Promise<Appointment> {
    const userId = req.credentials.user.id;

    const booking = await this.appointmentService.createBooking(userId, slotId);
    const appoinment = await this.appointmentService.createAppointment(booking);
    return appoinment;
  }
}
