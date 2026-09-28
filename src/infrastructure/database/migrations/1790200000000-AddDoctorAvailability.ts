import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDoctorAvailability1790200000000 implements MigrationInterface {
  name = 'AddDoctorAvailability1790200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Each clinic declares the zone its posted hours are written in, so no
    // code has to assume Egypt. Read back as an IANA name and validated on
    // use — an unknown zone must fail loudly rather than degrade to UTC.
    await queryRunner.query(
      `ALTER TABLE "clinics" ADD COLUMN "timezone" varchar NOT NULL DEFAULT 'Africa/Cairo'`,
    );

    // Slot length lives with the hours it subdivides, so one doctor can run
    // 30-minute Saturdays and 20-minute Tuesdays at the same clinic.
    await queryRunner.query(
      `ALTER TABLE "doctor_clinic_schedules" ADD COLUMN "slotMinutes" smallint NOT NULL DEFAULT 30`,
    );
    await queryRunner.query(
      `ALTER TABLE "doctor_clinic_schedules" ADD CONSTRAINT "CHK_dcs_slot_minutes" CHECK ("slotMinutes" > 0 AND "slotMinutes" <= 240)`,
    );
    await queryRunner.query(
      `ALTER TABLE "doctor_clinic_schedules" ADD CONSTRAINT "CHK_dcs_time_order" CHECK ("endTime" > "startTime")`,
    );

    // Duplicate rows for the same pairing/day/start would multiply every
    // generated slot; nothing enforced that before.
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_dcs_pairing_day_start" ON "doctor_clinic_schedules" ("doctorClinicId", "dayOfWeek", "startTime")`,
    );

    // Doctor leave: whole days, inclusive, spanning every clinic the doctor
    // sits at, because leave is personal rather than per-location.
    await queryRunner.query(`
      CREATE TABLE "doctor_leaves" (
        "id"        uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "doctorId"  uuid NOT NULL REFERENCES "doctors"("id") ON DELETE CASCADE,
        "startDate" date NOT NULL,
        "endDate"   date NOT NULL,
        "reason"    varchar NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "CHK_leave_range" CHECK ("endDate" >= "startDate")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_doctor_leaves_doctor_range" ON "doctor_leaves" ("doctorId", "startDate", "endDate")`,
    );

    // "Which of this doctor's slots are taken at this clinic" was an
    // unindexed scan — the only index on appointments was user-centric.
    await queryRunner.query(
      `CREATE INDEX "IDX_appointments_doctor_clinic_scheduled" ON "appointments" ("doctorId", "clinicId", "scheduledAt")`,
    );

    // A doctor cannot be in two places at once. The availability response is
    // only a snapshot, so this is what actually keeps two patients from
    // taking the same instant a second apart.
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_appointments_doctor_instant" ON "appointments" ("doctorId", "scheduledAt") WHERE "status" = 'SCHEDULED'`,
    );

    // Needed to block the slots an existing booking overlaps. Nullable
    // because no write path sets it yet; readers fall back to the day's
    // slotMinutes and then to DEFAULT_BOOKED_DURATION_MINUTES.
    await queryRunner.query(
      `ALTER TABLE "appointments" ADD COLUMN "durationMinutes" smallint NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "appointments" DROP COLUMN "durationMinutes"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."UQ_appointments_doctor_instant"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_appointments_doctor_clinic_scheduled"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_doctor_leaves_doctor_range"`,
    );
    await queryRunner.query(`DROP TABLE "doctor_leaves"`);
    await queryRunner.query(`DROP INDEX "public"."UQ_dcs_pairing_day_start"`);
    await queryRunner.query(
      `ALTER TABLE "doctor_clinic_schedules" DROP CONSTRAINT "CHK_dcs_time_order"`,
    );
    await queryRunner.query(
      `ALTER TABLE "doctor_clinic_schedules" DROP CONSTRAINT "CHK_dcs_slot_minutes"`,
    );
    await queryRunner.query(
      `ALTER TABLE "doctor_clinic_schedules" DROP COLUMN "slotMinutes"`,
    );
    await queryRunner.query(`ALTER TABLE "clinics" DROP COLUMN "timezone"`);
  }
}
