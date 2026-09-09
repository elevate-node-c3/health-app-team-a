import { Injectable, InternalServerErrorException } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private readonly transporter: nodemailer.Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT),
      secure: process.env.SMTP_SECURE === 'true',

      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD,
      },
    });
  }

  async sendOtp(email: string, otp: string): Promise<void> {
    try {
      await this.transporter.sendMail({
        from: `"My App" <${process.env.SMTP_USER}>`,
        to: email,
        subject: 'Verification Code',

        html: `
          <div>
            <h2>Verification Code</h2>

            <p>Your OTP is:</p>

            <h1>${otp}</h1>

            <p>
              This code will expire in 2 minutes.
            </p>

            <p>
              If you did not request this code,
              please ignore this email.
            </p>
          </div>
        `,
      });
    } catch (error) {
      throw new InternalServerErrorException(
        `Failed to send OTP email, ${error}`,
      );
    }
  }
}
