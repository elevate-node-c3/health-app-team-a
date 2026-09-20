import { Global, Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { JwtModule } from '@nestjs/jwt';
import { RedisService } from 'src/infrastructure/cache/redis.service';

import { EventService } from './event/event.service';
import { MailService } from './mail/mail.service';
import { OtpService } from './otp/otp.service';
import { SecurityService } from './security/security.service';
import { TokenService } from './token/token.service';

@Global()
@Module({
  imports: [
    JwtModule,
    EventEmitterModule.forRoot({
      wildcard: false,
      delimiter: '.',
      newListener: false,
      removeListener: false,
      maxListeners: 10,
      verboseMemoryLeak: false,
      ignoreErrors: false,
    }),
  ],
  providers: [
    EventService,
    TokenService,
    SecurityService,
    OtpService,
    MailService,
    RedisService,
  ],
  exports: [
    EventService,
    TokenService,
    SecurityService,
    OtpService,
    MailService,
    RedisService,
  ],
})
export class CommonModules {}
