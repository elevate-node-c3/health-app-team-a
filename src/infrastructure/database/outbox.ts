import { OutboxEventOrmEntity } from 'src/infrastructure/database/entities/outbox-event.entity';

import type { EntityManager } from 'typeorm';

/**
 * Records a domain event in the transactional outbox.
 *
 * Takes the caller's `manager` so the event commits with the rows that caused
 * it — that atomicity is the whole point of the outbox. Emitting in-process
 * instead would publish events for a transaction that later rolled back.
 *
 * `publishedAt` is left null; `OutboxPublisherService` claims unpublished rows
 * with `FOR UPDATE SKIP LOCKED` and stamps it once delivered.
 */
export async function appendOutboxEvent(
  manager: EntityManager,
  eventName: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const events = manager.getRepository(OutboxEventOrmEntity);
  await events.save(events.create({ eventName, payload, publishedAt: null }));
}
