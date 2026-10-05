import { randomUUID } from 'crypto';

import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { EventPublisher } from './event-publisher.port';

import type { EventEnvelope } from './event-publisher.port';
import type { RootConfig } from 'src/config/configuration';

/**
 * The one adapter in the app that calls `AmqpConnection.publish`.
 *
 * Every module that needs to raise a domain event depends on `EVENT_PUBLISHER`
 * (the port), never on this class or on `AmqpConnection` directly — that is
 * what keeps RabbitMQ out of the application and domain layers.
 */
@Injectable()
export class RabbitMqEventPublisher implements EventPublisher {
  private readonly logger = new Logger(RabbitMqEventPublisher.name);
  private readonly exchange: string;

  constructor(
    private readonly amqpConnection: AmqpConnection,
    configService: ConfigService<RootConfig>,
  ) {
    this.exchange = configService.getOrThrow('rabbitmq.exchange');
  }

  emit(eventName: string, payload: Record<string, unknown>): void {
    // Fire-and-forget by design: the caller is a request path that could not
    // fail on a missing listener under the previous in-process emitter, so a
    // slow or unreachable broker must not start failing it now.
    void this.publishEnvelope(
      eventName,
      randomUUID(),
      payload,
      new Date(),
    ).catch((error: unknown) => {
      this.logger.error(`Failed to emit ${eventName}`, error);
    });
  }

  async publishRecorded(
    eventName: string,
    eventId: string,
    payload: Record<string, unknown>,
    occurredAt: Date,
  ): Promise<void> {
    // Awaited and left to throw: the outbox's publish-then-mark ordering
    // depends on a failed publish propagating, so the row stays unmarked and
    // is retried on the next poll.
    await this.publishEnvelope(eventName, eventId, payload, occurredAt);
  }

  private async publishEnvelope(
    eventName: string,
    eventId: string,
    payload: Record<string, unknown>,
    occurredAt: Date,
  ): Promise<void> {
    const envelope: EventEnvelope = {
      eventId,
      eventName,
      occurredAt: occurredAt.toISOString(),
      version: 1,
      payload,
    };

    // Resolves once the broker has confirmed the message (publisher confirms
    // are enabled on the connection in MessagingModule), so a caller that
    // awaits this never marks an event delivered before it has actually left
    // the process.
    await this.amqpConnection.publish(this.exchange, eventName, envelope, {
      messageId: eventId,
      persistent: true,
      contentType: 'application/json',
    });
  }
}
