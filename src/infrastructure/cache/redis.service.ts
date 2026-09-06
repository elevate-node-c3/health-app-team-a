import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable } from '@nestjs/common';

import type { Cache } from 'cache-manager';

@Injectable()
export class RedisService {
  constructor(@Inject(CACHE_MANAGER) private readonly cache: Cache) {}

  async get<T>(key: string): Promise<T | undefined> {
    return this.cache.get<T>(key);
  }

  async set(key: string, value: unknown, ttl?: number): Promise<void> {
    await this.cache.set(key, value, ttl);
  }

  async del(key: string): Promise<void> {
    await this.cache.del(key);
  }

  revokedTokenPrefix(userId: string) {
    return `user:${userId}:REVOKED_TOKEN`;
  }

  revokedTokenKey({ jti, userId }: { jti: string; userId: string }) {
    return `${this.revokedTokenPrefix(userId)}:${jti}`;
  }

  otpKey({ userId, subject }: { userId: string; subject: string }) {
    return `user:${userId}:OTP:${subject}`;
  }

  otpKeyPenalty({ userId, subject }: { userId: string; subject: string }) {
    return `user:${userId}:OTP:${subject}:penalty`;
  }

  otpKeyBlock({ userId, subject }: { userId: string; subject: string }) {
    return `user:${userId}:OTP:${subject}:block`;
  }
}
