import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, type Transporter } from 'nodemailer';

import { type MailConfig } from '@/config/configuration';

const SIGNUP_OTP_TTL_MINUTES = 3;

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

  async sendSignupVerification(email: string, otp: string): Promise<void> {
    const message = {
      from: this.from,
      to: email,
      subject: 'Verify your Health App account',
      text: `Your verification code is ${otp}. It expires in ${SIGNUP_OTP_TTL_MINUTES} minutes.`,
    };

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        await this.transporter.sendMail(message);
        return;
      } catch (error) {
        if (attempt === 3) throw error;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
  }
}
