import { jest } from '@jest/globals';

import { BookingConfirmationEmailListener } from './booking-confirmation-email.listener';
import { MailService } from './mail.service';

describe('BookingConfirmationEmailListener', () => {
  const event = {
    eventId: 'event-1',
    userId: 'user-1',
    appointmentId: 'appointment-1',
    scheduledAt: '2026-10-15T15:00:00.000Z',
    doctorName: 'Ahmed Mohamed',
    clinicName: 'CityCare Clinic',
  };

  it('emails the booking details to the appointment owner', async () => {
    const findById = jest
      .fn<(id: string) => Promise<{ id: string; email: string } | null>>()
      .mockResolvedValue({ id: 'user-1', email: 'patient@example.com' });
    const userRepository = { findById };
    const sendBookingConfirmation = jest
      .fn<MailService['sendBookingConfirmation']>()
      .mockResolvedValue(undefined);
    const mailService = { sendBookingConfirmation };
    const listener = new BookingConfirmationEmailListener(
      userRepository as never,
      mailService as never,
    );

    await listener.handleAppointmentBooked(event);

    expect(findById).toHaveBeenCalledWith('user-1');
    expect(sendBookingConfirmation).toHaveBeenCalledWith(
      'patient@example.com',
      {
        appointmentId: 'appointment-1',
        scheduledAt: new Date(event.scheduledAt),
        doctorName: 'Ahmed Mohamed',
        clinicName: 'CityCare Clinic',
      },
    );
  });

  it('propagates mail failures so the outbox event remains retryable', async () => {
    const mailError = new Error('SMTP unavailable');
    const findById = jest
      .fn<(id: string) => Promise<{ id: string; email: string } | null>>()
      .mockResolvedValue({ id: 'user-1', email: 'patient@example.com' });
    const userRepository = { findById };
    const sendBookingConfirmation = jest
      .fn<MailService['sendBookingConfirmation']>()
      .mockRejectedValue(mailError);
    const listener = new BookingConfirmationEmailListener(
      userRepository as never,
      { sendBookingConfirmation } as never,
    );

    await expect(listener.handleAppointmentBooked(event)).rejects.toBe(
      mailError,
    );
  });
});
