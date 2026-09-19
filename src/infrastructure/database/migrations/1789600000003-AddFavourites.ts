import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFavourites1789600000003 implements MigrationInterface {
  name = 'AddFavourites1789600000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "favourites" ("userId" uuid NOT NULL, "doctorId" uuid NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_favourites_user_doctor" PRIMARY KEY ("userId", "doctorId"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "favourites" ADD CONSTRAINT "FK_favourites_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "favourites" ADD CONSTRAINT "FK_favourites_doctor" FOREIGN KEY ("doctorId") REFERENCES "doctors"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "favourites" DROP CONSTRAINT "FK_favourites_doctor"`,
    );
    await queryRunner.query(
      `ALTER TABLE "favourites" DROP CONSTRAINT "FK_favourites_user"`,
    );
    await queryRunner.query(`DROP TABLE "favourites"`);
  }
}
