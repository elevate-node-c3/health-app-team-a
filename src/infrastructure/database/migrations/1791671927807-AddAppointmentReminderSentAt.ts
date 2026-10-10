import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAppointmentReminderSentAt1791671927807 implements MigrationInterface {
  name = 'AddAppointmentReminderSentAt1791671927807';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "appointments" ADD "reminderSentAt" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_appointments_reminder_due" ON "appointments" ("scheduledAt") WHERE "status" = 'SCHEDULED' AND "reminderSentAt" IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_appointments_reminder_due"`,
    );
    await queryRunner.query(
      `ALTER TABLE "appointments" DROP COLUMN "reminderSentAt"`,
    );
  }
}
