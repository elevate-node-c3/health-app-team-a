import { createKeyv } from '@keyv/redis';
import { CacheModule, type CacheOptions } from '@nestjs/cache-manager';
import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type KeyvStoreAdapter } from 'keyv';

import { RedisService } from './redis.service';

import type { RedisConfig } from 'src/config/configuration';

@Global()
@Module({
  imports: [
    CacheModule.registerAsync({
      isGlobal: true,
      inject: [ConfigService],
      useFactory: (configService: ConfigService): CacheOptions => {
        const redis = configService.getOrThrow<RedisConfig>('redis');

        const credentials = redis.password
          ? `:${encodeURIComponent(redis.password)}@`
          : '';
        const url = `redis://${credentials}${redis.host}:${redis.port}`;

        const store = createKeyv(url) as unknown as KeyvStoreAdapter;

        return {
          stores: [store],
          ttl: redis.ttl,
        };
      },
    }),
  ],
  providers: [RedisService],
  exports: [RedisService],
})
export class AppCacheModule {}
