import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAppointmentHistory1791000000000 implements MigrationInterface {
  name = 'AddAppointmentHistory1791000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "appointments" ADD "doctorNameSnapshot" character varying, ADD "doctorPhotoSnapshot" character varying, ADD "specialtyNameSnapshot" character varying, ADD "clinicNameSnapshot" character varying, ADD "clinicAreaSnapshot" character varying`,
    );
    await queryRunner.query(
      `UPDATE "appointments" a SET "doctorNameSnapshot" = (SELECT d."name" FROM "doctors" d WHERE d."id" = a."doctorId"), "doctorPhotoSnapshot" = (SELECT d."photo" FROM "doctors" d WHERE d."id" = a."doctorId"), "specialtyNameSnapshot" = (SELECT s."name" FROM "doctors" d JOIN "specialties" s ON s."id" = d."specialtyId" WHERE d."id" = a."doctorId"), "clinicNameSnapshot" = (SELECT c."name" FROM "clinics" c WHERE c."id" = a."clinicId"), "clinicAreaSnapshot" = (SELECT concat_ws(', ', c."city", c."governorate") FROM "clinics" c WHERE c."id" = a."clinicId")`,
    );
    await queryRunner.query(
      `ALTER TABLE "appointments" DROP CONSTRAINT "FK_appointments_doctor"`,
    );
    await queryRunner.query(
      `ALTER TABLE "appointments" ALTER COLUMN "doctorId" DROP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "appointments" ADD CONSTRAINT "FK_appointments_doctor" FOREIGN KEY ("doctorId") REFERENCES "doctors"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_appointments_user_scheduled_id" ON "appointments" ("userId", "scheduledAt" DESC, "id" DESC)`,
    );
    await queryRunner.query(
      `ALTER TABLE "booking_holds" ADD "reschedulesAppointmentId" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "booking_holds" ADD CONSTRAINT "FK_booking_holds_source_appointment" FOREIGN KEY ("reschedulesAppointmentId") REFERENCES "appointments"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `CREATE TABLE "appointment_prescriptions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "appointmentId" uuid NOT NULL, "userId" uuid NOT NULL, "storageKey" character varying NOT NULL, "issuedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_appointment_prescriptions_id" PRIMARY KEY ("id"), CONSTRAINT "FK_appointment_prescriptions_appointment" FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_appointment_prescriptions_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_appointment_prescriptions_appointment" ON "appointment_prescriptions" ("appointmentId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_appointment_prescriptions_user_appointment" ON "appointment_prescriptions" ("userId", "appointmentId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "appointment_prescriptions"`);
    await queryRunner.query(
      `ALTER TABLE "booking_holds" DROP CONSTRAINT "FK_booking_holds_source_appointment"`,
    );
    await queryRunner.query(
      `ALTER TABLE "booking_holds" DROP COLUMN "reschedulesAppointmentId"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_appointments_user_scheduled_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "appointments" DROP CONSTRAINT "FK_appointments_doctor"`,
    );
    await queryRunner.query(
      `ALTER TABLE "appointments" ALTER COLUMN "doctorId" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "appointments" ADD CONSTRAINT "FK_appointments_doctor" FOREIGN KEY ("doctorId") REFERENCES "doctors"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "appointments" DROP COLUMN "doctorNameSnapshot", DROP COLUMN "doctorPhotoSnapshot", DROP COLUMN "specialtyNameSnapshot", DROP COLUMN "clinicNameSnapshot", DROP COLUMN "clinicAreaSnapshot"`,
    );
  }
}
