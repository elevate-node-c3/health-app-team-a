import { hash } from 'argon2';

import dataSource from '../data-source';

const SPECIALTY_ID = '11111111-1111-4111-8111-111111111111';
const DOCTOR_ID = '22222222-2222-4222-8222-222222222222';
const CLINIC_ID = '33333333-3333-4333-8333-333333333333';
const DOCTOR_CLINIC_ID = '44444444-4444-4444-8444-444444444444';
const PASSWORD = 'Password123!';

const PATIENTS = [
  { name: 'Patient A', email: 'patient.a@example.com', phone: '+201000000001' },
  { name: 'Patient B', email: 'patient.b@example.com', phone: '+201000000002' },
];

async function seed(): Promise<void> {
  await dataSource.initialize();

  await dataSource.query(
    `INSERT INTO specialties (id, name) VALUES ($1, 'Cardiology') ON CONFLICT DO NOTHING`,
    [SPECIALTY_ID],
  );

  await dataSource.query(
    `INSERT INTO doctors (id, name, title, "specialtyId", university, "yearsOfExperience", gender, "isVerified")
     VALUES ($1, 'Dr. Demo Hold', 'CONSULTANT', $2, 'Cairo University', 10, 'MALE', true)
     ON CONFLICT DO NOTHING`,
    [DOCTOR_ID, SPECIALTY_ID],
  );

  await dataSource.query(
    `INSERT INTO clinics (id, name, "placeType", governorate, city, latitude, longitude)
     VALUES ($1, 'Demo Clinic', 'CLINIC', 'Cairo', 'Nasr City', 30.0444, 31.2357)
     ON CONFLICT DO NOTHING`,
    [CLINIC_ID],
  );

  await dataSource.query(
    `INSERT INTO doctor_clinics (id, "doctorId", "clinicId", fee)
     VALUES ($1, $2, $3, 400)
     ON CONFLICT DO NOTHING`,
    [DOCTOR_CLINIC_ID, DOCTOR_ID, CLINIC_ID],
  );

  await dataSource.query(
    `INSERT INTO doctor_clinic_schedules ("doctorClinicId", "dayOfWeek", "startTime", "endTime")
     SELECT $1, day, '09:00', '17:00' FROM generate_series(0, 6) AS day
     WHERE NOT EXISTS (SELECT 1 FROM doctor_clinic_schedules WHERE "doctorClinicId" = $1)`,
    [DOCTOR_CLINIC_ID],
  );

  const passwordHash = await hash(PASSWORD);
  for (const patient of PATIENTS) {
    await dataSource.query(
      `INSERT INTO users (name, email, phone, password, gender, "isActive", "isVerified")
       SELECT $1, $2::varchar, $3, $4, 'MALE', true, true
       WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = $2::varchar)`,
      [patient.name, patient.email, patient.phone, passwordHash],
    );
  }

  await dataSource.destroy();

  console.log('Slot-hold demo data ready');
  console.log(`  doctorId: ${DOCTOR_ID}`);
  console.log(`  clinicId: ${CLINIC_ID}`);
  console.log('  hours:    every day 09:00-17:00 Cairo time, fee 400');
  console.log(
    `  patients: ${PATIENTS.map((p) => p.email).join(', ')} / ${PASSWORD}`,
  );
}

seed().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
