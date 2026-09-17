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

  public async getTTL(key: string): Promise<number> {
    const expiresAt = await this.cache.ttl(key);
    if (!expiresAt) return 0;
    return Math.max(0, expiresAt - Date.now());
  }

  otpKey({ userId, subject }: { userId: string; subject: string }) {
    return `user:${userId}:OTP:${subject}`;
  }

  otpKeyPenalty({ userId, subject }: { userId: string; subject: string }) {
    return `user:${userId}:OTP:${subject}:penalty`;
  }

  otpKeyCooldown({ userId, subject }: { userId: string; subject: string }) {
    return `user:${userId}:OTP:${subject}:cooldown`;
  }

  otpKeyBlock({ userId, subject }: { userId: string; subject: string }) {
    return `user:${userId}:OTP:${subject}:block`;
  }
}
