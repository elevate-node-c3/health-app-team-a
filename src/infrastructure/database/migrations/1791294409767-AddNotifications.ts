import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddNotifications1791294409767 implements MigrationInterface {
  name = 'AddNotifications1791294409767';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "notifications" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid NOT NULL, "eventId" uuid NOT NULL, "type" character varying NOT NULL, "title" character varying NOT NULL, "body" character varying NOT NULL, "data" jsonb NOT NULL DEFAULT '{}', "readAt" TIMESTAMP WITH TIME ZONE, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_notifications_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_notifications_event" ON "notifications" ("eventId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_notifications_user_created" ON "notifications" ("userId", "createdAt") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_notifications_user_unread" ON "notifications" ("userId") WHERE "readAt" IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" ADD CONSTRAINT "FK_notifications_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "notifications" DROP CONSTRAINT "FK_notifications_user"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_notifications_user_unread"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_notifications_user_created"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_notifications_event"`);
    await queryRunner.query(`DROP TABLE "notifications"`);
  }
}
