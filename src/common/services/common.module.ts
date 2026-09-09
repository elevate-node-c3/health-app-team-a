import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { RedisService } from 'src/infrastructure/cache/redis.service';

import { EmailService } from './email/email.service';
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
    RedisService,
    EmailService,
  ],
  exports: [
    TokenService,
    SecurityService,
    OtpService,
    RedisService,
    EmailService,
  ],
})
export class CommonModules {}
