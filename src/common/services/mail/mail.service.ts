import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createTransport,
  type SendMailOptions,
  type Transporter,
} from 'nodemailer';

import { type MailConfig } from '@/config/configuration';

const SIGNUP_OTP_TTL_SECONDS = 30;

@Injectable()
export class MailService {
  private readonly transporter: Transporter;
  private readonly from: string;

  constructor(configService: ConfigService) {
    const mailConfig = configService.getOrThrow<MailConfig>('mail');

    this.transporter = createTransport({
      host: mailConfig.host,
      port: mailConfig.port,
      secure: mailConfig.secure,
      auth:
        mailConfig.user && mailConfig.password
          ? { user: mailConfig.user, pass: mailConfig.password }
          : undefined,
    });
    this.from = mailConfig.from;
  }

  async sendOtp(email: string, otp: string): Promise<void> {
    const message = {
      from: this.from,
      to: email,
      subject: 'Your OTP Code',
      text: `Your OTP is ${otp}. It expires in ${SIGNUP_OTP_TTL_SECONDS} seconds.`,
    };

    await this.sendWithRetry(message);
  }

  async sendBookingConfirmation(
    email: string,
    booking: {
      appointmentId: string;
      scheduledAt: Date;
      doctorName: string;
      clinicName: string;
    },
  ): Promise<void> {
    const formattedTime = new Intl.DateTimeFormat('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(booking.scheduledAt);

    await this.sendWithRetry({
      from: this.from,
      to: email,
      subject: 'Your appointment is confirmed',
      text: [
        `Your appointment with Dr. ${booking.doctorName} at ${booking.clinicName} has been confirmed.`,
        `Appointment time: ${formattedTime}.`,
        'Please arrive 15 minutes before your appointment.',
        `Appointment reference: ${booking.appointmentId}.`,
      ].join('\n\n'),
    });
  }

  private async sendWithRetry(message: SendMailOptions): Promise<void> {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        await this.transporter.sendMail({ from: this.from, ...message });
        return;
      } catch (error) {
        if (attempt === 3) throw error;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
  }
}
