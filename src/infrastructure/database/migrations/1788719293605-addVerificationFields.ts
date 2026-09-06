import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddVerificationFields1788719293605 implements MigrationInterface {
  name = 'AddVerificationFields1788719293605';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD "isActive" boolean NOT NULL DEFAULT true`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD "isVerified" boolean NOT NULL DEFAULT false`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "isVerified"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "isActive"`);
  }
}
