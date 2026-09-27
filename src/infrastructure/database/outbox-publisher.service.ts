import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DataSource, IsNull } from 'typeorm';

import { OutboxEventOrmEntity } from './entities/outbox-event.entity';

@Injectable()
export class OutboxPublisherService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxPublisherService.name);
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly dataSource: DataSource,
    private readonly eventEmitter: EventEmitter2,
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
        await this.eventEmitter.emitAsync(event.eventName, {
          ...event.payload,
          eventId: event.id,
        });
        event.publishedAt = new Date();
        await manager.save(event);
      }
    });
  }
}
