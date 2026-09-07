import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { MailService } from './mail/mail.service';
import { OtpService } from './otp/otp.service';
import { SecurityService } from './security/security.service';
import { TokenService } from './token/token.service';

@Global()
@Module({
  imports: [JwtModule],
  providers: [TokenService, SecurityService, OtpService, MailService],
  exports: [TokenService, SecurityService, OtpService, MailService],
})
export class CommonModules {}
