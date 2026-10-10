import { Inject, Injectable } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { APPOINTMENT_REMINDER_TRIGGERED_EVENT } from 'src/infrastructure/messaging/event-names';

import { APPOINTMENT_UNIT_OF_WORK } from './domain/repositories/unit-of-work';

import type { AppointmentUnitOfWork } from './domain/repositories/unit-of-work';

export const REMINDER_LEAD_MS = 24 * 60 * 60 * 1000;
const REMINDER_BATCH_SIZE = 100;

@Injectable()
export class AppointmentReminderJob {
  constructor(
    @Inject(APPOINTMENT_UNIT_OF_WORK)
    private readonly unitOfWork: AppointmentUnitOfWork,
  ) {}

  @Interval(5 * 60 * 1000)
  async sendDueReminders(now: Date = new Date()): Promise<number> {
    return this.unitOfWork.execute(async (repos) => {
      const due = await repos.appointments.claimDueReminders(
        new Date(now.getTime() + REMINDER_LEAD_MS),
        REMINDER_BATCH_SIZE,
      );

      for (const appointment of due) {
        const receipt = await repos.appointments.findReceipt(
          appointment.id,
          appointment.userId,
        );
        await repos.appendEvent(APPOINTMENT_REMINDER_TRIGGERED_EVENT, {
          userId: appointment.userId,
          appointmentId: appointment.id,
          scheduledAt: appointment.scheduledAt.toISOString(),
          doctorName: receipt?.doctorName ?? appointment.doctorName,
          clinicName: receipt?.clinicName ?? 'the clinic',
        });
      }

      return due.length;
    });
  }
}
