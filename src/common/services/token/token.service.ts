import { randomUUID } from 'crypto';

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { User } from 'src/auth/domain/entities/user.model';

import type { StringValue } from 'ms';

@Injectable()
export class TokenService {
  private readonly JWT_ACCESS_EXP: StringValue;
  private readonly JWT_ACCESS_SECRET: string;

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {
    this.JWT_ACCESS_EXP =
      this.configService.getOrThrow<StringValue>('JWT_ACCESS_EXP');
    this.JWT_ACCESS_SECRET =
      this.configService.getOrThrow<string>('JWT_ACCESS_SECRET');
  }

  async sign(payload: Partial<User>) {
    const jti = randomUUID();
    return await this.jwtService.signAsync(payload, {
      secret: this.JWT_ACCESS_SECRET,
      expiresIn: this.JWT_ACCESS_EXP,
      jwtid: jti,
    });
  }

  verify(token: string) {
    return this.jwtService.verifyAsync(token, {
      secret: this.JWT_ACCESS_SECRET,
    });
  }
}
