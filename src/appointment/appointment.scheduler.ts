import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { AppointmentService } from './appointment.service';

@Injectable()
export class AppointmentScheduler {
  constructor(private readonly appointmentService: AppointmentService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async completeAppointments(): Promise<void> {
    await this.appointmentService.completeAppointments();
  }
}
