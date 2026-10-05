import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { EVENT_PUBLISHER } from 'src/infrastructure/messaging/event-publisher.port';
import { DataSource, IsNull } from 'typeorm';

import { OutboxEventOrmEntity } from './entities/outbox-event.entity';

import type { EventPublisher } from 'src/infrastructure/messaging/event-publisher.port';

/**
 * Hands rows out of the transactional outbox to the message broker.
 *
 * Publish-then-mark, at-least-once: a row's `publishedAt` is only set after
 * the broker has confirmed the publish. A crash between those two steps
 * leaves the row unmarked, so the next poll republishes it — which is why
 * every consumer of a published event must be idempotent (see
 * `ProcessedEventRepository`). The alternative order, mark-then-publish,
 * would risk losing an event outright on the same crash, which is wrong for
 * money and booking events.
 */
@Injectable()
export class OutboxPublisherService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxPublisherService.name);
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly dataSource: DataSource,
    @Inject(EVENT_PUBLISHER)
    private readonly eventPublisher: EventPublisher,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => {
      void this.publishPending().catch((error: unknown) => {
        this.logger.error('Could not publish pending outbox events', error);
      });
    }, 1_000);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async publishPending(): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const events = await manager
        .getRepository(OutboxEventOrmEntity)
        .createQueryBuilder('event')
        .where({ publishedAt: IsNull() })
        .orderBy('event.createdAt', 'ASC')
        .take(50)
        .setLock('pessimistic_write')
        .setOnLocked('skip_locked')
        .getMany();

      for (const event of events) {
        // The whole batch shares one DB transaction. If any row's publish
        // throws, the transaction rolls back and every row claimed in this
        // batch - including ones already confirmed by the broker a moment
        // earlier in this same loop - reverts to unpublished and is retried
        // on the next poll. That means an already-broker-confirmed event can
        // be republished, which is exactly the at-least-once duplicate this
        // service's consumers must already tolerate; it never means an event
        // is lost.
        await this.eventPublisher.publishRecorded(
          event.eventName,
          event.id,
          event.payload,
          event.createdAt,
        );
        event.publishedAt = new Date();
        await manager.save(event);
      }
    });
  }
}
