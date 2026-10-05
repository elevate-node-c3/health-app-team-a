import { RabbitMQModule } from '@golevelup/nestjs-rabbitmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ProcessedEventOrmEntity } from './entities/processed-event.entity';
import { EVENT_PUBLISHER } from './event-publisher.port';
import { PROCESSED_EVENT_REPOSITORY } from './processed-event.repository';
import { RabbitMqEventPublisher } from './rabbitmq-event-publisher';
import {
  DEAD_LETTER_EXCHANGE,
  EVENTS_EXCHANGE,
  RELIABLE_CONSUMERS,
  RETRY_DELAY_MS,
  RETRY_EXCHANGE,
  consumerQueueName,
  deadLetterQueueName,
  retryQueueName,
} from './rabbitmq.constants';
import { TypeOrmProcessedEventRepository } from './typeorm-processed-event.repository';

import type { RabbitMQQueueConfig } from '@golevelup/nestjs-rabbitmq';
import type { DynamicModule } from '@nestjs/common';
import type { RootConfig } from 'src/config/configuration';

/**
 * Captured once so the same dynamic module can sit in both `imports` and
 * `exports` below — that is what re-exports `AmqpConnection` to any module
 * that imports `MessagingModule`, which a consumer needs in order to publish
 * directly to a DLQ once its retries are exhausted.
 */
const rabbitMq: DynamicModule = RabbitMQModule.forRootAsync({
  imports: [ConfigModule],
  useFactory: (configService: ConfigService<RootConfig>) => ({
    uri: configService.getOrThrow('rabbitmq.url'),
    connectionInitOptions: { wait: false },
    exchanges: [
      { name: EVENTS_EXCHANGE, type: 'topic', options: { durable: true } },
      { name: RETRY_EXCHANGE, type: 'topic', options: { durable: true } },
      {
        name: DEAD_LETTER_EXCHANGE,
        type: 'topic',
        options: { durable: true },
      },
    ],
    // The retry and DLQ side of every consumer binding, asserted centrally
    // rather than by each consumer. A consumer's own main queue is still
    // declared at its `@RabbitSubscribe` site — that is intrinsic to where
    // the library runs the handler — but its retry/DLQ destinations exist
    // here and only here.
    queues: RELIABLE_CONSUMERS.flatMap(
      ({ consumer, eventName }): RabbitMQQueueConfig[] => {
        const mainQueue = consumerQueueName(consumer, eventName);
        return [
          {
            name: retryQueueName(consumer, eventName),
            exchange: RETRY_EXCHANGE,
            routingKey: mainQueue,
            options: {
              durable: true,
              // After sitting here for RETRY_DELAY_MS, the broker
              // dead-letters the message back to the main exchange under its
              // original routing key, which redelivers it to the main queue
              // for another attempt.
              messageTtl: RETRY_DELAY_MS,
              deadLetterExchange: EVENTS_EXCHANGE,
              deadLetterRoutingKey: eventName,
            },
          },
          {
            name: deadLetterQueueName(consumer, eventName),
            exchange: DEAD_LETTER_EXCHANGE,
            routingKey: mainQueue,
            options: { durable: true },
          },
        ];
      },
    ),
  }),
  inject: [ConfigService],
});

/**
 * The only module that may import `RabbitMQModule` or know an exchange name.
 *
 * It owns the whole topology — the events exchange, and every consumer's
 * retry and dead-letter queue, built from the single `RELIABLE_CONSUMERS`
 * list — so a feature module never declares its own exchange, retry policy,
 * or DLQ. A feature module either publishes through `EVENT_PUBLISHER` or
 * consumes with `@RabbitSubscribe` naming only the queue options this module
 * hands it no new topology of its own.
 */
@Module({
  imports: [TypeOrmModule.forFeature([ProcessedEventOrmEntity]), rabbitMq],
  providers: [
    { provide: EVENT_PUBLISHER, useClass: RabbitMqEventPublisher },
    {
      provide: PROCESSED_EVENT_REPOSITORY,
      useClass: TypeOrmProcessedEventRepository,
    },
  ],
  exports: [EVENT_PUBLISHER, PROCESSED_EVENT_REPOSITORY, rabbitMq],
})
export class MessagingModule {}
