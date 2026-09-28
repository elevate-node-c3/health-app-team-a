import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAppoimentmodule1790591397753 implements MigrationInterface {
  name = 'AddAppoimentmodule1790591397753';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "favourites" DROP CONSTRAINT "FK_favourites_user"`,
    );
    await queryRunner.query(
      `ALTER TABLE "favourites" DROP CONSTRAINT "FK_favourites_doctor"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_articles_published_publishedAt"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."slots_status_enum" AS ENUM('AVAILABLE', 'HELD', 'BOOKED', 'BLOCKED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "slots" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "doctorClinicScheduleId" uuid NOT NULL, "date" date NOT NULL, "startTime" TIME NOT NULL, "endTime" TIME NOT NULL, "status" "public"."slots_status_enum" NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_8b553bb1941663b63fd38405e42" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "booking_orm_entity" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid NOT NULL, "slotId" uuid NOT NULL, "expiresAt" character varying NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_2922dcb87d558d0ee72d1044b5e" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "appointments" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid NOT NULL, "doctorId" uuid NOT NULL, "clinicId" uuid, "scheduledAt" TIMESTAMP WITH TIME ZONE NOT NULL, "status" character varying NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_4a437a9a27e948726b8bb3e36ad" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_7a7db1268669ed9fc50d007094" ON "appointments" ("userId", "status", "scheduledAt") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_3fddf7592d60b1d2c483214d87" ON "articles" ("isPublished", "publishedAt") `,
    );
    await queryRunner.query(
      `ALTER TABLE "favourites" ADD CONSTRAINT "FK_b75b5e4a2475d03acfe11eac1d1" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "favourites" ADD CONSTRAINT "FK_73b10e8d378feca4220ba745a48" FOREIGN KEY ("doctorId") REFERENCES "doctors"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "slots" ADD CONSTRAINT "FK_bc26240262247a281f67d502ff2" FOREIGN KEY ("doctorClinicScheduleId") REFERENCES "doctor_clinic_schedules"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "booking_orm_entity" ADD CONSTRAINT "FK_464dfc2776edfe5effed2a1f3fa" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "booking_orm_entity" ADD CONSTRAINT "FK_6ef770e7ea245d77386d6692a54" FOREIGN KEY ("slotId") REFERENCES "slots"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "appointments" ADD CONSTRAINT "FK_01733651151c8a1d6d980135cc4" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "appointments" ADD CONSTRAINT "FK_0c1af27b469cb8dca420c160d65" FOREIGN KEY ("doctorId") REFERENCES "doctors"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "appointments" ADD CONSTRAINT "FK_040a7ee2072d45bc98efddf3c02" FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "appointments" DROP CONSTRAINT "FK_040a7ee2072d45bc98efddf3c02"`,
    );
    await queryRunner.query(
      `ALTER TABLE "appointments" DROP CONSTRAINT "FK_0c1af27b469cb8dca420c160d65"`,
    );
    await queryRunner.query(
      `ALTER TABLE "appointments" DROP CONSTRAINT "FK_01733651151c8a1d6d980135cc4"`,
    );
    await queryRunner.query(
      `ALTER TABLE "booking_orm_entity" DROP CONSTRAINT "FK_6ef770e7ea245d77386d6692a54"`,
    );
    await queryRunner.query(
      `ALTER TABLE "booking_orm_entity" DROP CONSTRAINT "FK_464dfc2776edfe5effed2a1f3fa"`,
    );
    await queryRunner.query(
      `ALTER TABLE "slots" DROP CONSTRAINT "FK_bc26240262247a281f67d502ff2"`,
    );
    await queryRunner.query(
      `ALTER TABLE "favourites" DROP CONSTRAINT "FK_73b10e8d378feca4220ba745a48"`,
    );
    await queryRunner.query(
      `ALTER TABLE "favourites" DROP CONSTRAINT "FK_b75b5e4a2475d03acfe11eac1d1"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_3fddf7592d60b1d2c483214d87"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_7a7db1268669ed9fc50d007094"`,
    );
    await queryRunner.query(`DROP TABLE "appointments"`);
    await queryRunner.query(`DROP TABLE "booking_orm_entity"`);
    await queryRunner.query(`DROP TABLE "slots"`);
    await queryRunner.query(`DROP TYPE "public"."slots_status_enum"`);
    await queryRunner.query(
      `CREATE INDEX "IDX_articles_published_publishedAt" ON "articles" ("isPublished", "publishedAt") `,
    );
    await queryRunner.query(
      `ALTER TABLE "favourites" ADD CONSTRAINT "FK_favourites_doctor" FOREIGN KEY ("doctorId") REFERENCES "doctors"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "favourites" ADD CONSTRAINT "FK_favourites_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }
}
