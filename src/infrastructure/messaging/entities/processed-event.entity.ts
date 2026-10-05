import { CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

/**
 * One consumer's claim on one event — the record that makes a handler
 * idempotent under at-least-once delivery.
 *
 * The composite primary key is deliberate: `(eventId, handler)` rather than
 * `eventId` alone, so two different consumers of the same event dedupe
 * independently and neither can block the other's first delivery.
 */
@Entity('processed_events')
export class ProcessedEventOrmEntity {
  @PrimaryColumn('uuid')
  eventId!: string;

  @PrimaryColumn()
  handler!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  processedAt!: Date;
}
