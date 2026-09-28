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

const CAIRO = 'Africa/Cairo';
const SUNDAY = 0;
const TUESDAY = 2;
const SATURDAY = 6;

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
async function seed(): Promise<void> {
  await dataSource.initialize();

  try {
    await dataSource.transaction(async (manager) => {
      const specialty = await manager.save(
        manager.create(SpecialtyOrmEntity, { name: 'Cardiology (seed)' }),
      );

      const doctor = await manager.save(
        manager.create(DoctorOrmEntity, {
          name: 'Dr Mona Seed',
          photo: null,
          title: DoctorTitle.CONSULTANT,
          specialtyId: specialty.id,
          subspecialties: 'Interventional cardiology',
          university: 'Cairo University',
          yearsOfExperience: 12,
          patientsCount: 900,
          ratingAverage: 4.7,
          ratingCount: 40,
          gender: Gender.FEMALE,
          isVerified: true,
        }),
      );

      // An unverified doctor, to confirm the profile 404s rather than leaking.
      await manager.save(
        manager.create(DoctorOrmEntity, {
          name: 'Dr Unverified Seed',
          photo: null,
          title: DoctorTitle.SPECIALIST,
          specialtyId: specialty.id,
          subspecialties: null,
          university: 'Cairo University',
          yearsOfExperience: 3,
          patientsCount: 10,
          ratingAverage: 0,
          ratingCount: 0,
          gender: Gender.MALE,
          isVerified: false,
        }),
      );

      const [nile, maadi, closed] = await manager.save([
        manager.create(ClinicOrmEntity, {
          name: 'Nile Clinic (seed)',
          placeType: PlaceType.CLINIC,
          governorate: 'Cairo',
          city: 'Maadi',
          latitude: 29.96,
          longitude: 31.25,
          isActive: true,
          timezone: CAIRO,
        }),
        manager.create(ClinicOrmEntity, {
          name: 'Maadi Centre (seed)',
          placeType: PlaceType.CENTRE,
          governorate: 'Cairo',
          city: 'Maadi',
          latitude: 29.97,
          longitude: 31.26,
          isActive: true,
          timezone: CAIRO,
        }),
        manager.create(ClinicOrmEntity, {
          name: 'Closed Clinic (seed)',
          placeType: PlaceType.HOSPITAL,
          governorate: 'Cairo',
          city: 'Nasr City',
          latitude: 30.05,
          longitude: 31.34,
          isActive: true,
          timezone: CAIRO,
        }),
      ]);

      const [nilePairing, maadiPairing, inactivePairing] = await manager.save([
        manager.create(DoctorClinicOrmEntity, {
          doctorId: doctor.id,
          clinicId: nile.id,
          fee: 300,
          isActive: true,
        }),
        // Deliberately a different fee: the profile must not collapse the two.
        manager.create(DoctorClinicOrmEntity, {
          doctorId: doctor.id,
          clinicId: maadi.id,
          fee: 450,
          isActive: true,
        }),
        manager.create(DoctorClinicOrmEntity, {
          doctorId: doctor.id,
          clinicId: closed.id,
          fee: 200,
          isActive: false,
        }),
      ]);

      await manager.save([
        // Saturdays: 09:00-13:00 in 30-minute slots -> 8 slots.
        manager.create(DoctorClinicScheduleOrmEntity, {
          doctorClinicId: nilePairing.id,
          dayOfWeek: SATURDAY,
          startTime: '09:00:00',
          endTime: '13:00:00',
          slotMinutes: 30,
        }),
        // Tuesdays: 17:00-20:00 in 20-minute slots -> 9 slots.
        manager.create(DoctorClinicScheduleOrmEntity, {
          doctorClinicId: nilePairing.id,
          dayOfWeek: TUESDAY,
          startTime: '17:00:00',
          endTime: '20:00:00',
          slotMinutes: 20,
        }),
        manager.create(DoctorClinicScheduleOrmEntity, {
          doctorClinicId: maadiPairing.id,
          dayOfWeek: SUNDAY,
          startTime: '10:00:00',
          endTime: '12:00:00',
          slotMinutes: 30,
        }),
        // Hours on the inactive pairing, to prove they are never exposed.
        manager.create(DoctorClinicScheduleOrmEntity, {
          doctorClinicId: inactivePairing.id,
          dayOfWeek: SATURDAY,
          startTime: '09:00:00',
          endTime: '17:00:00',
          slotMinutes: 30,
        }),
      ]);

      const today = localDateOf(new Date(), CAIRO);
      const firstSaturday = nextDayOfWeek(today, SATURDAY);
      const secondSaturday = addDays(firstSaturday, 7);
      // A week of leave starting the day after the first Saturday, so the first
      // Saturday stays bookable and the second falls inside the leave.
      const leaveStart = addDays(firstSaturday, 1);
      const leaveEnd = addDays(leaveStart, 6);

      await manager.save(
        manager.create(DoctorLeaveOrmEntity, {
          doctorId: doctor.id,
          startDate: leaveStart,
          endDate: leaveEnd,
          reason: 'Annual leave (seed)',
        }),
      );

      const patient = await manager.findOne(UserOrmEntity, { where: {} });
      if (!patient) {
        console.warn(
          'No user exists, so no appointments were seeded. Sign a user up and re-run to seed bookings.',
        );
      } else {
        await manager.save([
          // On the grid: 10:00 on the first Saturday -> marked taken.
          manager.create(AppointmentOrmEntity, {
            userId: patient.id,
            doctorId: doctor.id,
            clinicId: nile.id,
            scheduledAt: instantAt(firstSaturday, '10:00'),
            durationMinutes: 30,
            status: AppointmentStatus.SCHEDULED,
          }),
          // Off the grid: 09:15 -> isOffSchedule, and blocks 09:00 and 09:30.
          manager.create(AppointmentOrmEntity, {
            userId: patient.id,
            doctorId: doctor.id,
            clinicId: nile.id,
            scheduledAt: instantAt(firstSaturday, '09:15'),
            durationMinutes: 30,
            status: AppointmentStatus.SCHEDULED,
          }),
          // On a leave day: no slots are generated, but this is still real.
          manager.create(AppointmentOrmEntity, {
            userId: patient.id,
            doctorId: doctor.id,
            clinicId: nile.id,
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
          `  doctor id            ${doctor.id}`,
          `  active clinic (300)  ${nile.id}`,
          `  active clinic (450)  ${maadi.id}`,
          `  inactive pairing at  ${closed.id}  (expect 404)`,
          `  first Saturday       ${firstSaturday}  (8 slots, 09:15 off-grid booking)`,
          `  leave                ${leaveStart} .. ${leaveEnd}`,
          `  booked on leave day  ${secondSaturday} 11:00`,
          '',
          'Try:',
          `  GET /doctors/${doctor.id}`,
          `  GET /doctors/${doctor.id}/availability?clinicId=${nile.id}`,
          '',
        ].join('\n'),
      );
    });
  } finally {
    await dataSource.destroy();
  }
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

seed().catch((error) => {
  console.error(error);
  process.exit(1);
});
