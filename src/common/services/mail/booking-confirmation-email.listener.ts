import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { UserOrmEntity } from 'src/auth/infrastructure/entities/typeorm/user.entity';
import { DataSource } from 'typeorm';

import { MailService } from './mail.service';

import { APPOINTMENT_BOOKED_EVENT } from '@/payment-method/payment.events';

interface AppointmentBookedEvent {
  eventId: string;
  userId: string;
  appointmentId: string;
  scheduledAt: string;
  doctorName: string;
  clinicName: string;
}

@Injectable()
export class BookingConfirmationEmailListener {
  constructor(
    private readonly dataSource: DataSource,
    private readonly mailService: MailService,
  ) {}

  @OnEvent(APPOINTMENT_BOOKED_EVENT)
  async handleAppointmentBooked(event: AppointmentBookedEvent): Promise<void> {
    const user = await this.dataSource
      .getRepository(UserOrmEntity)
      .findOneBy({ id: event.userId });
    if (!user)
      throw new Error(`Booking email recipient ${event.userId} not found`);

    const scheduledAt = new Date(event.scheduledAt);
    if (!Number.isFinite(scheduledAt.getTime()))
      throw new Error(`Invalid appointment time for ${event.appointmentId}`);

    await this.mailService.sendBookingConfirmation(user.email, {
      appointmentId: event.appointmentId,
      scheduledAt,
      doctorName: event.doctorName,
      clinicName: event.clinicName,
    });
  }
}
