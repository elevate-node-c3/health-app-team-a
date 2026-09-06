import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { SecurityService } from './security/security.service';
import { TokenService } from './token/token.service';

@Global()
@Module({
  imports: [JwtModule],
  providers: [TokenService, SecurityService],
  exports: [TokenService, SecurityService],
})
export class CommonModules {}
