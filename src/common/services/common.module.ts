import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { RedisService } from 'src/infrastructure/cache/redis.service';

import { BookingConfirmationEmailListener } from './mail/booking-confirmation-email.listener';
import { MailService } from './mail/mail.service';
import { OtpService } from './otp/otp.service';
import { SecurityService } from './security/security.service';
import { TokenService } from './token/token.service';

@Global()
@Module({
  imports: [JwtModule],
  providers: [
    TokenService,
    SecurityService,
    OtpService,
    MailService,
    BookingConfirmationEmailListener,
    RedisService,
  ],
  exports: [
    TokenService,
    SecurityService,
    OtpService,
    MailService,
    RedisService,
  ],
})
export class CommonModules {}
