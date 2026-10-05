import { AppointmentStatus } from 'src/appointment/domain/enums/appointment-status.enum';
import { AppointmentOrmEntity } from 'src/appointment/infrastructure/entities/typeorm/appointment.entity';
import { Gender } from 'src/auth/domain/enums/user.enum';
import { UserOrmEntity } from 'src/auth/infrastructure/entities/typeorm/user.entity';
import {
  addDays,
  localDateOf,
  wallClockToInstant,
} from 'src/common/utils/clinic-time.util';
import { DoctorTitle } from 'src/doctor/domain/enums/doctor-title.enum';
import { PlaceType } from 'src/doctor/domain/enums/place-type.enum';
import { ClinicOrmEntity } from 'src/doctor/infrastructure/entities/typeorm/clinic.entity';
import { DoctorClinicScheduleOrmEntity } from 'src/doctor/infrastructure/entities/typeorm/doctor-clinic-schedule.entity';
import { DoctorClinicOrmEntity } from 'src/doctor/infrastructure/entities/typeorm/doctor-clinic.entity';
import { DoctorLeaveOrmEntity } from 'src/doctor/infrastructure/entities/typeorm/doctor-leave.entity';
import { DoctorOrmEntity } from 'src/doctor/infrastructure/entities/typeorm/doctor.entity';
import { SpecialtyOrmEntity } from 'src/doctor/infrastructure/entities/typeorm/specialty.entity';

import dataSource from '../data-source';

import { reportSeedFailure, runSeedCli } from './seed-runner';

const CAIRO = 'Africa/Cairo';
const SUNDAY = 0;
const TUESDAY = 2;
const SATURDAY = 6;

// Fixed ids: every row this fixture owns is upserted by id, so re-running
// never duplicates it. Distinct from slot-hold.seed.ts's 1111.../2222...
// range so the two fixtures can never collide.
const SPECIALTY_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
const DOCTOR_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2';
const UNVERIFIED_DOCTOR_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3';
const NILE_CLINIC_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4';
const MAADI_CLINIC_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5';
const CLOSED_CLINIC_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa6';
const NILE_PAIRING_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa7';
const MAADI_PAIRING_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa8';
const INACTIVE_PAIRING_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa9';
const SATURDAY_SCHEDULE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaab1';
const TUESDAY_SCHEDULE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaab2';
const SUNDAY_SCHEDULE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaab3';
const INACTIVE_SCHEDULE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaab4';
const LEAVE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaab5';

// The seed account availability's demo appointments attach to — created by
// users.seed.ts. Deterministic, unlike picking "whichever user exists first".
const APPOINTMENT_OWNER_EMAIL = 'nour@example.com';

/**
 * Seeds one doctor whose availability exercises every rule the profile and
 * availability endpoints implement, so both can be verified end to end:
 *
 *  - two ACTIVE clinics at DIFFERENT fees   -> the fee is per pairing
 *  - one INACTIVE pairing                   -> exposes no availability at all
 *  - Saturday 09:00-13:00 @30min            -> 8 slots
 *  - Tuesday 17:00-20:00 @20min             -> 9 slots, per-row slot length
 *  - a week of leave                        -> no slots, bookings still shown
 *  - an on-grid booking                     -> marked taken
 *  - an off-grid booking at 09:15           -> isOffSchedule, blocks 09:00/09:30
 *  - a booking on a leave day               -> still surfaced as taken
 */
export async function seedAvailability(): Promise<void> {
  await dataSource.transaction(async (manager) => {
    await manager.upsert(
      SpecialtyOrmEntity,
      { id: SPECIALTY_ID, name: 'Cardiology (seed)' },
      ['id'],
    );

    await manager.upsert(
      DoctorOrmEntity,
      {
        id: DOCTOR_ID,
        name: 'Dr Mona Seed',
        photo: null,
        title: DoctorTitle.CONSULTANT,
        specialtyId: SPECIALTY_ID,
        subspecialties: 'Interventional cardiology',
        university: 'Cairo University',
        yearsOfExperience: 12,
        patientsCount: 900,
        ratingAverage: 4.7,
        ratingCount: 40,
        gender: Gender.FEMALE,
        isVerified: true,
      },
      ['id'],
    );

    // An unverified doctor, to confirm the profile 404s rather than leaking.
    await manager.upsert(
      DoctorOrmEntity,
      {
        id: UNVERIFIED_DOCTOR_ID,
        name: 'Dr Unverified Seed',
        photo: null,
        title: DoctorTitle.SPECIALIST,
        specialtyId: SPECIALTY_ID,
        subspecialties: null,
        university: 'Cairo University',
        yearsOfExperience: 3,
        patientsCount: 10,
        ratingAverage: 0,
        ratingCount: 0,
        gender: Gender.MALE,
        isVerified: false,
      },
      ['id'],
    );

    await manager.upsert(
      ClinicOrmEntity,
      [
        {
          id: NILE_CLINIC_ID,
          name: 'Nile Clinic (seed)',
          placeType: PlaceType.CLINIC,
          governorate: 'Cairo',
          city: 'Maadi',
          latitude: 29.96,
          longitude: 31.25,
          isActive: true,
          timezone: CAIRO,
        },
        {
          id: MAADI_CLINIC_ID,
          name: 'Maadi Centre (seed)',
          placeType: PlaceType.CENTRE,
          governorate: 'Cairo',
          city: 'Maadi',
          latitude: 29.97,
          longitude: 31.26,
          isActive: true,
          timezone: CAIRO,
        },
        {
          id: CLOSED_CLINIC_ID,
          name: 'Closed Clinic (seed)',
          placeType: PlaceType.HOSPITAL,
          governorate: 'Cairo',
          city: 'Nasr City',
          latitude: 30.05,
          longitude: 31.34,
          isActive: true,
          timezone: CAIRO,
        },
      ],
      ['id'],
    );

    await manager.upsert(
      DoctorClinicOrmEntity,
      [
        {
          id: NILE_PAIRING_ID,
          doctorId: DOCTOR_ID,
          clinicId: NILE_CLINIC_ID,
          fee: 300,
          isActive: true,
        },
        // Deliberately a different fee: the profile must not collapse the two.
        {
          id: MAADI_PAIRING_ID,
          doctorId: DOCTOR_ID,
          clinicId: MAADI_CLINIC_ID,
          fee: 450,
          isActive: true,
        },
        {
          id: INACTIVE_PAIRING_ID,
          doctorId: DOCTOR_ID,
          clinicId: CLOSED_CLINIC_ID,
          fee: 200,
          isActive: false,
        },
      ],
      ['id'],
    );

    await manager.upsert(
      DoctorClinicScheduleOrmEntity,
      [
        // Saturdays: 09:00-13:00 in 30-minute slots -> 8 slots.
        {
          id: SATURDAY_SCHEDULE_ID,
          doctorClinicId: NILE_PAIRING_ID,
          dayOfWeek: SATURDAY,
          startTime: '09:00:00',
          endTime: '13:00:00',
          slotMinutes: 30,
        },
        // Tuesdays: 17:00-20:00 in 20-minute slots -> 9 slots.
        {
          id: TUESDAY_SCHEDULE_ID,
          doctorClinicId: NILE_PAIRING_ID,
          dayOfWeek: TUESDAY,
          startTime: '17:00:00',
          endTime: '20:00:00',
          slotMinutes: 20,
        },
        {
          id: SUNDAY_SCHEDULE_ID,
          doctorClinicId: MAADI_PAIRING_ID,
          dayOfWeek: SUNDAY,
          startTime: '10:00:00',
          endTime: '12:00:00',
          slotMinutes: 30,
        },
        // Hours on the inactive pairing, to prove they are never exposed.
        {
          id: INACTIVE_SCHEDULE_ID,
          doctorClinicId: INACTIVE_PAIRING_ID,
          dayOfWeek: SATURDAY,
          startTime: '09:00:00',
          endTime: '17:00:00',
          slotMinutes: 30,
        },
      ],
      ['id'],
    );

    const today = localDateOf(new Date(), CAIRO);
    const firstSaturday = nextDayOfWeek(today, SATURDAY);
    const secondSaturday = addDays(firstSaturday, 7);
    // A week of leave starting the day after the first Saturday, so the first
    // Saturday stays bookable and the second falls inside the leave.
    const leaveStart = addDays(firstSaturday, 1);
    const leaveEnd = addDays(leaveStart, 6);

    // Upserted by its fixed id, so a later run's freshly computed window
    // replaces the old one in place rather than adding a second leave row.
    await manager.upsert(
      DoctorLeaveOrmEntity,
      {
        id: LEAVE_ID,
        doctorId: DOCTOR_ID,
        startDate: leaveStart,
        endDate: leaveEnd,
        reason: 'Annual leave (seed)',
      },
      ['id'],
    );

    const patient = await manager.findOne(UserOrmEntity, {
      where: { email: APPOINTMENT_OWNER_EMAIL },
    });
    if (!patient) {
      console.warn(
        `No user with email ${APPOINTMENT_OWNER_EMAIL} exists, so no appointments were seeded. Run "npm run seed:users" first and re-run to seed bookings.`,
      );
    } else {
      // These 3 demo appointments are deliberately computed relative to
      // "today" (so the fixture always exercises *this week's* grid), which
      // means their scheduledAt drifts between runs on different days and
      // can't be upserted by a fixed id or by (doctorId, scheduledAt).
      // Deleting this fixture's own prior appointments first — scoped to its
      // own fixed doctor id, never touching a real booking — keeps the row
      // count at exactly 3 regardless of how many days have passed since the
      // last run.
      await manager.delete(AppointmentOrmEntity, { doctorId: DOCTOR_ID });
      await manager.save([
        // On the grid: 10:00 on the first Saturday -> marked taken.
        manager.create(AppointmentOrmEntity, {
          userId: patient.id,
          doctorId: DOCTOR_ID,
          clinicId: NILE_CLINIC_ID,
          scheduledAt: instantAt(firstSaturday, '10:00'),
          durationMinutes: 30,
          status: AppointmentStatus.SCHEDULED,
        }),
        // Off the grid: 09:15 -> isOffSchedule, and blocks 09:00 and 09:30.
        manager.create(AppointmentOrmEntity, {
          userId: patient.id,
          doctorId: DOCTOR_ID,
          clinicId: NILE_CLINIC_ID,
          scheduledAt: instantAt(firstSaturday, '09:15'),
          durationMinutes: 30,
          status: AppointmentStatus.SCHEDULED,
        }),
        // On a leave day: no slots are generated, but this is still real.
        manager.create(AppointmentOrmEntity, {
          userId: patient.id,
          doctorId: DOCTOR_ID,
          clinicId: NILE_CLINIC_ID,
          scheduledAt: instantAt(secondSaturday, '11:00'),
          durationMinutes: 30,
          status: AppointmentStatus.SCHEDULED,
        }),
      ]);
    }

    console.log(
      [
        '',
        'Seeded availability fixtures:',
        `  doctor id            ${DOCTOR_ID}`,
        `  active clinic (300)  ${NILE_CLINIC_ID}`,
        `  active clinic (450)  ${MAADI_CLINIC_ID}`,
        `  inactive pairing at  ${CLOSED_CLINIC_ID}  (expect 404)`,
        `  first Saturday       ${firstSaturday}  (8 slots, 09:15 off-grid booking)`,
        `  leave                ${leaveStart} .. ${leaveEnd}`,
        `  booked on leave day  ${secondSaturday} 11:00`,
        '',
        'Try:',
        `  GET /doctors/${DOCTOR_ID}`,
        `  GET /doctors/${DOCTOR_ID}/availability?clinicId=${NILE_CLINIC_ID}`,
        '',
      ].join('\n'),
    );
  });
}

/** The given weekday on or after `isoDate`. */
function nextDayOfWeek(isoDate: string, dayOfWeek: number): string {
  for (let offset = 0; offset < 7; offset += 1) {
    const candidate = addDays(isoDate, offset);
    if (new Date(`${candidate}T00:00:00Z`).getUTCDay() === dayOfWeek) {
      return candidate;
    }
  }
  throw new Error(`No ${dayOfWeek} found within a week of ${isoDate}`);
}

/** A Cairo wall-clock time on a date, as the instant to store. */
function instantAt(isoDate: string, time: string): Date {
  const instant = wallClockToInstant(isoDate, time, CAIRO);
  if (!instant) throw new Error(`${time} does not exist on ${isoDate}`);
  return instant;
}

if (require.main === module) {
  runSeedCli(seedAvailability).catch(reportSeedFailure);
}
