import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, type Transporter } from 'nodemailer';

import { type MailConfig } from '@/config/configuration';

const SIGNUP_OTP_TTL_MINUTES = 2;

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
    await this.transporter.sendMail({
      from: this.from,
      to: email,
      subject: 'Verify your Health App account',
      text: `Your verification code is ${otp}. It expires in ${SIGNUP_OTP_TTL_MINUTES} minutes.`,
    });
  }
}
