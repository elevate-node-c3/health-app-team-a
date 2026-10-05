import { Nack } from '@golevelup/nestjs-rabbitmq';
import { jest } from '@jest/globals';
import {
  DEAD_LETTER_EXCHANGE,
  MAX_DELIVERY_ATTEMPTS,
  consumerQueueName,
} from 'src/infrastructure/messaging/rabbitmq.constants';

import { BookingConfirmationEmailListener } from './booking-confirmation-email.listener';
import { MailService } from './mail.service';

import type { ConsumeMessage } from 'amqplib';

const APPOINTMENT_BOOKED_EVENT = 'appointment.booked';
const QUEUE = consumerQueueName('email', APPOINTMENT_BOOKED_EVENT);
const HANDLER = BookingConfirmationEmailListener.name;

const envelope = {
  eventId: 'event-1',
  eventName: APPOINTMENT_BOOKED_EVENT,
  occurredAt: '2026-10-15T14:00:00.000Z',
  version: 1 as const,
  payload: {
    userId: 'user-1',
    appointmentId: 'appointment-1',
    scheduledAt: '2026-10-15T15:00:00.000Z',
    doctorName: 'Ahmed Mohamed',
    clinicName: 'CityCare Clinic',
  },
};

/** A raw delivery whose `x-death` records `attempt - 1` prior failures. */
function rawMessage(attempt = 1): ConsumeMessage {
  const deaths =
    attempt > 1 ? [{ queue: QUEUE, count: attempt - 1 }] : undefined;
  return {
    properties: { headers: deaths ? { 'x-death': deaths } : {} },
  } as unknown as ConsumeMessage;
}

describe('BookingConfirmationEmailListener', () => {
  function makeHarness(options: { claimed?: boolean } = {}) {
    const findById = jest
      .fn<(id: string) => Promise<{ id: string; email: string } | null>>()
      .mockResolvedValue({ id: 'user-1', email: 'patient@example.com' });
    const userRepository = { findById };

    const sendBookingConfirmation = jest
      .fn<MailService['sendBookingConfirmation']>()
      .mockResolvedValue(undefined);
    const mailService = { sendBookingConfirmation };

    const tryClaim = jest
      .fn<(eventId: string, handler: string) => Promise<boolean>>()
      .mockResolvedValue(options.claimed ?? true);
    const release = jest
      .fn<(eventId: string, handler: string) => Promise<void>>()
      .mockResolvedValue(undefined);
    const processedEvents = { tryClaim, release };

    const publish = jest
      .fn<
        (
          exchange: string,
          routingKey: string,
          message: unknown,
        ) => Promise<boolean>
      >()
      .mockResolvedValue(true);
    const amqpConnection = { publish };

    const listener = new BookingConfirmationEmailListener(
      userRepository as never,
      processedEvents,
      mailService as never,
      amqpConnection as never,
    );

    return {
      listener,
      findById,
      sendBookingConfirmation,
      tryClaim,
      release,
      publish,
    };
  }

  it('emails the booking details to the appointment owner and acks', async () => {
    const { listener, findById, sendBookingConfirmation, tryClaim } =
      makeHarness();

    const result = await listener.handleAppointmentBooked(
      envelope,
      rawMessage(),
    );

    expect(tryClaim).toHaveBeenCalledWith('event-1', HANDLER);
    expect(findById).toHaveBeenCalledWith('user-1');
    expect(sendBookingConfirmation).toHaveBeenCalledWith(
      'patient@example.com',
      {
        appointmentId: 'appointment-1',
        scheduledAt: new Date(envelope.payload.scheduledAt),
        doctorName: 'Ahmed Mohamed',
        clinicName: 'CityCare Clinic',
      },
    );
    expect(result).toBeUndefined();
  });

  // The duplicate-delivery criterion: a second delivery of an event already
  // claimed must not send a second email, and must still ack.
  it('acks without sending when the event was already claimed', async () => {
    const { listener, sendBookingConfirmation, tryClaim } = makeHarness({
      claimed: false,
    });

    const result = await listener.handleAppointmentBooked(
      envelope,
      rawMessage(),
    );

    expect(tryClaim).toHaveBeenCalledWith('event-1', HANDLER);
    expect(sendBookingConfirmation).not.toHaveBeenCalled();
    expect(result).toBeUndefined();
  });

  it('releases its claim and nacks for a retry below the attempt cap', async () => {
    const { listener, sendBookingConfirmation, release, publish } =
      makeHarness();
    sendBookingConfirmation.mockRejectedValue(new Error('SMTP unavailable'));

    const result = await listener.handleAppointmentBooked(
      envelope,
      rawMessage(1),
    );

    expect(release).toHaveBeenCalledWith('event-1', HANDLER);
    expect(result).toBeInstanceOf(Nack);
    expect((result as Nack).requeue).toBe(false);
    expect(publish).not.toHaveBeenCalled();
  });

  it('dead-letters and acks once the attempt cap is reached', async () => {
    const { listener, sendBookingConfirmation, release, publish } =
      makeHarness();
    sendBookingConfirmation.mockRejectedValue(new Error('SMTP unavailable'));

    const result = await listener.handleAppointmentBooked(
      envelope,
      rawMessage(MAX_DELIVERY_ATTEMPTS),
    );

    expect(release).toHaveBeenCalledWith('event-1', HANDLER);
    expect(publish).toHaveBeenCalledWith(
      DEAD_LETTER_EXCHANGE,
      QUEUE,
      envelope,
      expect.anything(),
    );
    expect(result).toBeUndefined();
  });
});
