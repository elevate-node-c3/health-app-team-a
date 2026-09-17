import { randomUUID } from 'crypto';

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { TokenType } from 'src/auth/domain/enums/token.enum';
import { IJwtUserPayload } from 'src/common/services/token/jwt.type';

import type { StringValue } from 'ms';

export interface SignedToken {
  token: string;
  jti: string;
  expiresAt: Date;
}

@Injectable()
export class TokenService {
  private readonly ACCESS_EXP: StringValue;
  private readonly ACCESS_SECRET: string;
  private readonly REFRESH_EXP: StringValue;
  private readonly REFRESH_SECRET: string;

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {
    this.ACCESS_EXP =
      this.configService.getOrThrow<StringValue>('JWT_ACCESS_EXP');
    this.ACCESS_SECRET =
      this.configService.getOrThrow<string>('JWT_ACCESS_SECRET');
    this.REFRESH_EXP =
      this.configService.getOrThrow<StringValue>('JWT_REFRESH_EXP');
    this.REFRESH_SECRET =
      this.configService.getOrThrow<string>('JWT_REFRESH_SECRET');
  }

  private getSecret(type: TokenType): string {
    return type === TokenType.ACCESS ? this.ACCESS_SECRET : this.REFRESH_SECRET;
  }

  private getExpiry(type: TokenType): StringValue {
    return type === TokenType.ACCESS ? this.ACCESS_EXP : this.REFRESH_EXP;
  }

  async sign(
    payload: IJwtUserPayload,
    type: TokenType,
    jti: string = randomUUID(),
    expiresIn?: number,
  ): Promise<SignedToken> {
    const token = await this.jwtService.signAsync(payload, {
      secret: this.getSecret(type),
      expiresIn: expiresIn ?? this.getExpiry(type),
      jwtid: jti,
    });

    const { exp } = this.jwtService.decode<{ exp: number }>(token);

    return { token, jti, expiresAt: new Date(exp * 1000) };
  }

  verify(token: string, type: TokenType) {
    return this.jwtService.verifyAsync(token, {
      secret: this.getSecret(type),
    });
  }
}
