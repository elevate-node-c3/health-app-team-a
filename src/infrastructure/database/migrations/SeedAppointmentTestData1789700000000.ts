import { MigrationInterface, QueryRunner } from 'typeorm';

export class SeedAppointmentTestData1789700000000 implements MigrationInterface {
  name = 'SeedAppointmentTestData1789700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const specialtyId = '10000000-0000-0000-0000-000000000001';
    const doctorId = '20000000-0000-0000-0000-000000000001';
    const clinicId = '30000000-0000-0000-0000-000000000001';
    const doctorClinicId = '40000000-0000-0000-0000-000000000001';
    const scheduleId = '50000000-0000-0000-0000-000000000001';

    // 1. Specialty
    await queryRunner.query(`
      INSERT INTO "specialties"
        ("id", "name", "createdAt", "updatedAt")
      VALUES
        (
          '${specialtyId}',
          'Cardiology',
          NOW(),
          NOW()
        )
    `);

    // 2. Doctor
    await queryRunner.query(`
      INSERT INTO "doctors"
        (
          "id",
          "name",
          "title",
          "specialtyId",
          "subspecialties",
          "university",
          "yearsOfExperience",
          "patientsCount",
          "ratingAverage",
          "ratingCount",
          "gender",
          "isVerified",
          "createdAt",
          "updatedAt"
        )
      VALUES
        (
          '${doctorId}',
          'Dr. Ahmed Hassan',
          'Consultant Cardiologist',
          '${specialtyId}',
          'Heart Disease, Hypertension',
          'Cairo University',
          10,
          1500,
          4.80,
          250,
          'MALE',
          true,
          NOW(),
          NOW()
        )
    `);

    // 3. Clinic
    await queryRunner.query(`
      INSERT INTO "clinics"
        (
          "id",
          "name",
          "placeType",
          "governorate",
          "city",
          "latitude",
          "longitude",
          "isActive",
          "createdAt",
          "updatedAt"
        )
      VALUES
        (
          '${clinicId}',
          'Al Shifa Medical Center',
          'MEDICAL_CENTER',
          'Cairo',
          'Nasr City',
          30.062600,
          31.340700,
          true,
          NOW(),
          NOW()
        )
    `);

    // 4. Doctor Clinic
    await queryRunner.query(`
      INSERT INTO "doctor_clinics"
        (
          "id",
          "doctorId",
          "clinicId",
          "fee",
          "isActive",
          "createdAt",
          "updatedAt"
        )
      VALUES
        (
          '${doctorClinicId}',
          '${doctorId}',
          '${clinicId}',
          500.00,
          true,
          NOW(),
          NOW()
        )
    `);

    // 5. Doctor Clinic Schedule
    //
    // 2026-09-29 is Tuesday.
    // dayOfWeek = 2
    //
    await queryRunner.query(`
      INSERT INTO "doctor_clinic_schedules"
        (
          "id",
          "doctorClinicId",
          "dayOfWeek",
          "startTime",
          "endTime",
          "createdAt",
          "updatedAt"
        )
      VALUES
        (
          '${scheduleId}',
          '${doctorClinicId}',
          2,
          '09:00',
          '13:00',
          NOW(),
          NOW()
        )
    `);

    // 6. Slots
    await queryRunner.query(`
      INSERT INTO "slots"
        (
          "id",
          "doctorClinicScheduleId",
          "date",
          "startTime",
          "endTime",
          "status",
          "createdAt",
          "updatedAt"
        )
      VALUES
        (
          '60000000-0000-0000-0000-000000000001',
          '${scheduleId}',
          '2026-09-29',
          '09:00',
          '09:30',
          'AVAILABLE',
          NOW(),
          NOW()
        ),
        (
          '60000000-0000-0000-0000-000000000002',
          '${scheduleId}',
          '2026-09-29',
          '09:30',
          '10:00',
          'AVAILABLE',
          NOW(),
          NOW()
        ),
        (
          '60000000-0000-0000-0000-000000000003',
          '${scheduleId}',
          '2026-09-29',
          '10:00',
          '10:30',
          'AVAILABLE',
          NOW(),
          NOW()
        ),
        (
          '60000000-0000-0000-0000-000000000004',
          '${scheduleId}',
          '2026-09-29',
          '10:30',
          '11:00',
          'AVAILABLE',
          NOW(),
          NOW()
        ),
        (
          '60000000-0000-0000-0000-000000000005',
          '${scheduleId}',
          '2026-09-29',
          '11:00',
          '11:30',
          'AVAILABLE',
          NOW(),
          NOW()
        )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "slots"
      WHERE "doctorClinicScheduleId" =
      '50000000-0000-0000-0000-000000000001'
    `);

    await queryRunner.query(`
      DELETE FROM "doctor_clinic_schedules"
      WHERE "id" = '50000000-0000-0000-0000-000000000001'
    `);

    await queryRunner.query(`
      DELETE FROM "doctor_clinics"
      WHERE "id" = '40000000-0000-0000-0000-000000000001'
    `);

    await queryRunner.query(`
      DELETE FROM "clinics"
      WHERE "id" = '30000000-0000-0000-0000-000000000001'
    `);

    await queryRunner.query(`
      DELETE FROM "doctors"
      WHERE "id" = '20000000-0000-0000-0000-000000000001'
    `);

    await queryRunner.query(`
      DELETE FROM "specialties"
      WHERE "id" = '10000000-0000-0000-0000-000000000001'
    `);
  }
}
