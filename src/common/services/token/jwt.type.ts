import { AccessLevel } from 'src/auth/domain/enums/access-level.enum';

export interface IJwtUserPayload {
  sub: string;
  email: string;
  sid: string;
  level: AccessLevel;
}

export interface IDecodedJwtPayload extends IJwtUserPayload {
  iat: number;
  exp: number;
  jti: string;
}
