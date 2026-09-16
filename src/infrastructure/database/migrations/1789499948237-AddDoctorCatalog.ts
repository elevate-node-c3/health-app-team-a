import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDoctorCatalog1789499948237 implements MigrationInterface {
  name = 'AddDoctorCatalog1789499948237';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "specialties" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying NOT NULL, "icon" character varying, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_565f38f8b0417c7dbd40e429782" UNIQUE ("name"), CONSTRAINT "PK_ba01cec5aa8ac48778a1d097e98" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "doctors" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying NOT NULL, "photo" character varying, "title" character varying NOT NULL, "specialtyId" uuid NOT NULL, "subspecialties" character varying, "university" character varying NOT NULL, "yearsOfExperience" integer NOT NULL, "patientsCount" integer NOT NULL DEFAULT '0', "ratingAverage" numeric(3,2) NOT NULL DEFAULT '0', "ratingCount" integer NOT NULL DEFAULT '0', "gender" character varying NOT NULL, "isVerified" boolean NOT NULL DEFAULT false, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_8207e7889b50ee3695c2b8154ff" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_5e31a1b2872a68277b66c512d7" ON "doctors" ("specialtyId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "clinics" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying NOT NULL, "placeType" character varying NOT NULL, "governorate" character varying NOT NULL, "city" character varying NOT NULL, "latitude" numeric(9,6) NOT NULL, "longitude" numeric(9,6) NOT NULL, "isActive" boolean NOT NULL DEFAULT true, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_5513b659e4d12b01a8ab3956abc" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "doctor_clinics" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "doctorId" uuid NOT NULL, "clinicId" uuid NOT NULL, "fee" numeric(10,2) NOT NULL, "isActive" boolean NOT NULL DEFAULT true, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_866776796dc9ef66c57f30981d4" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_d2c2af287983e9a39c19441d32" ON "doctor_clinics" ("doctorId", "clinicId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "doctor_clinic_schedules" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "doctorClinicId" uuid NOT NULL, "dayOfWeek" smallint NOT NULL, "startTime" TIME NOT NULL, "endTime" TIME NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_bbe7cd392b6a68f5c61c8ffb83b" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_91592dc6ce0dbd16b214499d2a" ON "doctor_clinic_schedules" ("doctorClinicId") `,
    );
    await queryRunner.query(
      `ALTER TABLE "doctors" ADD CONSTRAINT "FK_5e31a1b2872a68277b66c512d74" FOREIGN KEY ("specialtyId") REFERENCES "specialties"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "doctor_clinics" ADD CONSTRAINT "FK_1b97548d6d7384014b4f0318299" FOREIGN KEY ("doctorId") REFERENCES "doctors"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "doctor_clinics" ADD CONSTRAINT "FK_bc39436050f91183e5fee76f7ab" FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "doctor_clinic_schedules" ADD CONSTRAINT "FK_91592dc6ce0dbd16b214499d2ae" FOREIGN KEY ("doctorClinicId") REFERENCES "doctor_clinics"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "doctor_clinic_schedules" DROP CONSTRAINT "FK_91592dc6ce0dbd16b214499d2ae"`,
    );
    await queryRunner.query(
      `ALTER TABLE "doctor_clinics" DROP CONSTRAINT "FK_bc39436050f91183e5fee76f7ab"`,
    );
    await queryRunner.query(
      `ALTER TABLE "doctor_clinics" DROP CONSTRAINT "FK_1b97548d6d7384014b4f0318299"`,
    );
    await queryRunner.query(
      `ALTER TABLE "doctors" DROP CONSTRAINT "FK_5e31a1b2872a68277b66c512d74"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_91592dc6ce0dbd16b214499d2a"`,
    );
    await queryRunner.query(`DROP TABLE "doctor_clinic_schedules"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_d2c2af287983e9a39c19441d32"`,
    );
    await queryRunner.query(`DROP TABLE "doctor_clinics"`);
    await queryRunner.query(`DROP TABLE "clinics"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_5e31a1b2872a68277b66c512d7"`,
    );
    await queryRunner.query(`DROP TABLE "doctors"`);
    await queryRunner.query(`DROP TABLE "specialties"`);
  }
}
