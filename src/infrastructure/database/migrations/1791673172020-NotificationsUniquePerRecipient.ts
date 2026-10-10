import { MigrationInterface, QueryRunner } from 'typeorm';

export class NotificationsUniquePerRecipient1791673172020 implements MigrationInterface {
  name = 'NotificationsUniquePerRecipient1791673172020';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_notifications_event"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_notifications_event_user" ON "notifications" ("eventId", "userId") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_notifications_event_user"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_notifications_event" ON "notifications" ("eventId") `,
    );
  }
}
