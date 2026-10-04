import { Inject, Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { USER_REPOSITORY } from 'src/auth/domain/repositories/user.repository';

import { MailService } from './mail.service';

import type { UserRepository } from 'src/auth/domain/repositories/user.repository';

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
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserRepository,
    private readonly mailService: MailService,
  ) {}

  @OnEvent(APPOINTMENT_BOOKED_EVENT)
  async handleAppointmentBooked(event: AppointmentBookedEvent): Promise<void> {
    // A single read through the existing port; no transaction is needed and
    // wrapping one would be rule 10's "unnecessary transaction".
    const user = await this.userRepository.findById(event.userId);
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
