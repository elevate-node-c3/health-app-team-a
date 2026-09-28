import { randomUUID } from 'crypto';

import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';

import { Appointment } from './domain/entities/appointment.model';
import { Booking, BookingStatus } from './domain/entities/booking.model';
import { AppointmentStatus } from './domain/enums/appointment-status.enum';
import { SlotStatus } from './domain/enums/slot-status.enum';
import {
  type AppointmentRepo,
  APPOINTMENT_REPO,
} from './domain/repositories/appointment.repository';
import {
  type BookingRepo,
  BOOKING_REPO,
} from './domain/repositories/booking.repository';
import {
  SLOT_REPO,
  type SlotRepo,
} from './domain/repositories/slot.repository';

export interface completeAppointments {
  eventID: string;
  appointment: object;
}

@Injectable()
export class AppointmentService {
  constructor(
    @Inject(APPOINTMENT_REPO)
    private readonly appointmentRepo: AppointmentRepo,
    @Inject(SLOT_REPO)
    private readonly bookingRepo: BookingRepo,
    @Inject(BOOKING_REPO)
    private readonly slotRepo: SlotRepo,
    @Inject('RabbitMQ_Client') private readonly rabbiteClient: ClientProxy,
  ) {}
  async createBooking(userId: string, slotId: string): Promise<Booking> {
    //check if the slot is available or not
    const slot = await this.slotRepo.findById(slotId);
    if (!slot || slot.status !== SlotStatus.AVAILABLE)
      throw Error('this slot is not availlable');
    //create booking for this slot
    const booking = await this.bookingRepo.create({ userId, slotId });
    if (!booking) throw Error('operation booking not success');
    booking.status = BookingStatus.CONFIRMED;
    await this.bookingRepo.save(booking);
    return booking;
  }
  //Payment methoed
  async goToPaying(): Promise<void> {}
  //create Appoinment
  async createAppointment(booking: Booking): Promise<Appointment> {
    const slot = await this.slotRepo.findById(booking.slotId);

    if (!slot) {
      throw new Error('Slot not found');
    }

    const schedlueAt = new Date(slot.date);

    schedlueAt.setHours(
      slot.startTime.getHours(),
      slot.startTime.getMinutes(),
      0,
    );
    const input = {
      bookingId: booking.id,
      scheduledAt: schedlueAt,
      status: AppointmentStatus.SCHEDULED,
    };
    const appointment = await this.appointmentRepo.create(input);
    return appointment;
  }

  async completeAppointments(): Promise<void> {
    const now = new Date();

    const appointments =
      await this.appointmentRepo.findExpiredUpcomingAppointments(now);
    if (!appointments) throw new NotFoundException();
    for (const appointment of appointments) {
      appointment.status = AppointmentStatus.COMPLETED;

      await this.appointmentRepo.save(appointment);

      //create event and publish it
      const event: completeAppointments = {
        eventID: randomUUID(),
        appointment: appointment,
      };
      this.rabbiteClient.emit('An appointment was completed', event);
    }
  }
}
