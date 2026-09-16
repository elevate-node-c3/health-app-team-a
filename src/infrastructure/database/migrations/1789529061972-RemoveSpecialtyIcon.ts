import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveSpecialtyIcon1789529061972 implements MigrationInterface {
  name = 'RemoveSpecialtyIcon1789529061972';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "specialties" DROP COLUMN "icon"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "specialties" ADD "icon" character varying`,
    );
  }
}
