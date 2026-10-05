import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * One row per (eventId, handler) a RabbitMQ consumer has successfully
 * claimed — the idempotency store behind at-least-once delivery. See
 * `ProcessedEventRepository`.
 */
export class AddProcessedEvents1791100000000 implements MigrationInterface {
  name = 'AddProcessedEvents1791100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "processed_events" ("eventId" uuid NOT NULL, "handler" character varying NOT NULL, "processedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_processed_events" PRIMARY KEY ("eventId", "handler"))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "processed_events"`);
  }
}
