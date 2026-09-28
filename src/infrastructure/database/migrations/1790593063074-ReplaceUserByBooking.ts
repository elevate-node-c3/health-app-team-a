import { MigrationInterface, QueryRunner } from 'typeorm';

export class ReplaceUserByBooking1790593063074 implements MigrationInterface {
  name = 'ReplaceUserByBooking1790593063074';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "appointments" DROP CONSTRAINT "FK_01733651151c8a1d6d980135cc4"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_7a7db1268669ed9fc50d007094"`,
    );
    await queryRunner.query(
      `ALTER TABLE "appointments" RENAME COLUMN "userId" TO "bookingId"`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_4c27211b5b8fd725a659aeb48d" ON "appointments" ("bookingId", "status", "scheduledAt") `,
    );
    await queryRunner.query(
      `ALTER TABLE "appointments" ADD CONSTRAINT "FK_d739abdad04ae2d59d6a32fc31c" FOREIGN KEY ("bookingId") REFERENCES "booking_orm_entity"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "appointments" DROP CONSTRAINT "FK_d739abdad04ae2d59d6a32fc31c"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_4c27211b5b8fd725a659aeb48d"`,
    );
    await queryRunner.query(
      `ALTER TABLE "appointments" RENAME COLUMN "bookingId" TO "userId"`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_7a7db1268669ed9fc50d007094" ON "appointments" ("scheduledAt", "status", "userId") `,
    );
    await queryRunner.query(
      `ALTER TABLE "appointments" ADD CONSTRAINT "FK_01733651151c8a1d6d980135cc4" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }
}
