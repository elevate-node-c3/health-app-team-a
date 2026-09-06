import { Injectable } from '@nestjs/common';
import { hash, verify } from 'argon2';
@Injectable()
export class SecurityService {
  static OtpService: Provider;
  constructor() {}

  async hash(text: string | Buffer): Promise<string> {
    return await hash(text);
  }

  async verify(digest: string, password: string | Buffer) {
    return await verify(digest, password);
  }
}
