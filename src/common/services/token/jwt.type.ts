export interface IJwtUserPayload {
  sub: string;
  email: string;
}

export interface IDecodedJwtPayload extends IJwtUserPayload {
  iat: number;
  exp: number;
  jti: string;
}
