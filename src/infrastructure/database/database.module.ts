import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { MessagingModule } from '../messaging/messaging.module';

import { OutboxEventOrmEntity } from './entities/outbox-event.entity';
import { OutboxPublisherService } from './outbox-publisher.service';

import type { DatabaseConfig } from 'src/config/configuration';

@Module({
  imports: [
    MessagingModule,
    TypeOrmModule.forFeature([OutboxEventOrmEntity]),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const database = configService.getOrThrow<DatabaseConfig>('database');

        return {
          type: 'postgres' as const,
          host: database.host,
          port: database.port,
          username: database.username,
          password: database.password,
          database: database.name,
          autoLoadEntities: true,
          synchronize: false,
          migrations: [__dirname + '/migrations/*{.ts,.js}'],
          migrationsRun: false,
        };
      },
    }),
  ],
  providers: [OutboxPublisherService],
})
export class DatabaseModule {}
