import { MigrationInterface, QueryRunner } from 'typeorm';

export class CanonicalizeUserContacts1788879000000 implements MigrationInterface {
  name = 'CanonicalizeUserContacts1788879000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "users" SET "email" = LOWER(TRIM("email"))`,
    );
    await queryRunner.query(
      `UPDATE "users" SET "phone" = CASE WHEN "phone" LIKE '+20%' THEN '0' || SUBSTRING("phone" FROM 4) WHEN "phone" LIKE '20%' THEN '0' || SUBSTRING("phone" FROM 3) ELSE "phone" END`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_users_email_lower" ON "users" (LOWER("email"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_users_phone" ON "users" ("phone")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_users_phone"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_users_email_lower"`);
  }
}
