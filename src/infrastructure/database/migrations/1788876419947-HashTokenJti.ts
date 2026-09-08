import { MigrationInterface, QueryRunner } from 'typeorm';

export class HashTokenJti1788876419947 implements MigrationInterface {
  name = 'HashTokenJti1788876419947';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "tokens" RENAME COLUMN "jti" TO "jtiHash"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tokens" RENAME CONSTRAINT "UQ_7d4251c84698d0633156759f5ee" TO "UQ_2aa79ecee3c6b735ba135601f67"`,
    );

    await queryRunner.query(
      `UPDATE "tokens" SET "jtiHash" = encode(sha256(convert_to("jtiHash", 'UTF8')), 'hex')`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`UPDATE "tokens" SET "revoked" = true`);
    await queryRunner.query(`UPDATE "sessions" SET "revoked" = true`);

    await queryRunner.query(
      `ALTER TABLE "tokens" RENAME CONSTRAINT "UQ_2aa79ecee3c6b735ba135601f67" TO "UQ_7d4251c84698d0633156759f5ee"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tokens" RENAME COLUMN "jtiHash" TO "jti"`,
    );
  }
}
