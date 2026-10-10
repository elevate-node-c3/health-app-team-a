import { Nack } from '@golevelup/nestjs-rabbitmq';
import { jest } from '@jest/globals';
import {
  APPOINTMENT_BOOKED_EVENT,
  APPOINTMENT_CANCELLED_EVENT,
  APPOINTMENT_REMINDER_TRIGGERED_EVENT,
  FAVOURITE_ADDED_EVENT,
} from 'src/infrastructure/messaging/event-names';

import { NotificationType } from './domain/enums/notification-type.enum';
import { NotificationListener } from './notification.listener';

import type { ConsumeMessage } from 'amqplib';
import type { EventEnvelope } from 'src/infrastructure/messaging/event-publisher.port';

function envelope<T>(eventName: string, payload: T): EventEnvelope<T> {
  return {
    eventId: 'event-1',
    eventName,
    occurredAt: '2026-10-06T08:00:00Z',
    version: 1,
    payload,
  };
}

const firstDelivery = { properties: { headers: {} } } as ConsumeMessage;

const appointment = {
  userId: 'user-1',
  appointmentId: 'appointment-1',
  scheduledAt: '2026-10-11T07:00:00Z',
  doctorName: 'Dr. Sara',
  clinicName: 'Nile Clinic',
};

describe('NotificationListener', () => {
  let notificationService: {
    createFromEvent: jest.Mock;
    isReminderDue: jest.Mock;
  };
  let amqpConnection: { publish: jest.Mock };
  let listener: NotificationListener;

  beforeEach(() => {
    notificationService = {
      createFromEvent: jest
        .fn<() => Promise<void>>()
        .mockResolvedValue(undefined),
      isReminderDue: jest.fn<() => Promise<boolean>>().mockResolvedValue(true),
    };
    amqpConnection = {
      publish: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    };
    listener = new NotificationListener(
      notificationService as never,
      amqpConnection as never,
    );
  });

  it('creates a Booking Confirmed notification with the time in Cairo', async () => {
    await listener.handleAppointmentBooked(
      envelope(APPOINTMENT_BOOKED_EVENT, appointment),
      firstDelivery,
    );

    expect(notificationService.createFromEvent).toHaveBeenCalledWith(
      'user-1',
      'event-1',
      {
        type: NotificationType.BOOKING_CONFIRMED,
        title: 'Booking Confirmed',
        body: 'Your appointment with Dr. Sara at Nile Clinic on Sun 11 Oct at 10:00 AM is confirmed.',
        data: { appointmentId: 'appointment-1' },
      },
    );
  });

  it('creates an Appointment Cancelled notification', async () => {
    await listener.handleAppointmentCancelled(
      envelope(APPOINTMENT_CANCELLED_EVENT, appointment),
      firstDelivery,
    );

    expect(notificationService.createFromEvent).toHaveBeenCalledWith(
      'user-1',
      'event-1',
      expect.objectContaining({
        type: NotificationType.APPOINTMENT_CANCELLED,
        title: 'Appointment Cancelled',
      }),
    );
  });

  it('creates a reminder while the appointment is still scheduled', async () => {
    await listener.handleAppointmentReminder(
      envelope(APPOINTMENT_REMINDER_TRIGGERED_EVENT, appointment),
      firstDelivery,
    );

    expect(notificationService.isReminderDue).toHaveBeenCalledWith(
      'appointment-1',
      new Date('2026-10-11T07:00:00Z'),
    );
    expect(notificationService.createFromEvent).toHaveBeenCalledWith(
      'user-1',
      'event-1',
      expect.objectContaining({ type: NotificationType.APPOINTMENT_REMINDER }),
    );
  });

  it('creates no reminder for a cancelled or rescheduled appointment', async () => {
    notificationService.isReminderDue.mockResolvedValue(false);

    const result = await listener.handleAppointmentReminder(
      envelope(APPOINTMENT_REMINDER_TRIGGERED_EVENT, appointment),
      firstDelivery,
    );

    expect(result).toBeUndefined();
    expect(notificationService.createFromEvent).not.toHaveBeenCalled();
  });

  it('creates a Doctor Added to Favorites notification', async () => {
    await listener.handleFavouriteAdded(
      envelope(FAVOURITE_ADDED_EVENT, {
        userId: 'user-1',
        doctorId: 'doctor-1',
        doctorName: 'Dr. Sara',
      }),
      firstDelivery,
    );

    expect(notificationService.createFromEvent).toHaveBeenCalledWith(
      'user-1',
      'event-1',
      {
        type: NotificationType.DOCTOR_FAVORITED,
        title: 'Doctor Added to Favorites',
        body: 'Dr. Sara has been added to your favorites.',
        data: { doctorId: 'doctor-1' },
      },
    );
  });

  it('asks for a retry when saving fails', async () => {
    notificationService.createFromEvent.mockRejectedValue(new Error('db down'));

    const result = await listener.handleAppointmentBooked(
      envelope(APPOINTMENT_BOOKED_EVENT, appointment),
      firstDelivery,
    );

    expect(result).toBeInstanceOf(Nack);
    expect(amqpConnection.publish).not.toHaveBeenCalled();
  });
});
