import { ClinicOrmEntity } from 'src/doctor/infrastructure/entities/typeorm/clinic.entity';
import { DoctorClinicScheduleOrmEntity } from 'src/doctor/infrastructure/entities/typeorm/doctor-clinic-schedule.entity';
import { DoctorClinicOrmEntity } from 'src/doctor/infrastructure/entities/typeorm/doctor-clinic.entity';
import { DoctorOrmEntity } from 'src/doctor/infrastructure/entities/typeorm/doctor.entity';

import type { EntityManager } from 'typeorm';

/** What the schedule says about one instant that really is on offer. */
export interface OfferedSlot {
  /** The length this slot runs for, from the hours it subdivides. */
  slotMinutes: number;
  /** The fee for this doctor at this clinic. */
  fee: number;
}

/**
 * The clinic's own wall clock for the requested instant. Every comparison
 * below is made on it, because a clinic's posted hours are written in its own
 * zone — never in Cairo's and never in UTC's.
 */
const LOCAL = `(CAST(:scheduledAt AS timestamptz) AT TIME ZONE clinic.timezone)`;

/**
 * Whether an instant is a time this doctor genuinely offers at this clinic,
 * and what it is worth.
 *
 * This is the write-side twin of `buildAvailability`: it answers for one
 * instant what slot generation answers for a month, so a hold can never be
 * taken on a time the calendar would not have shown. Both must agree on the
 * pairing gate, the clinic's zone, the day's own `slotMinutes`, the grid the
 * slots sit on, and leave.
 *
 * A plain function rather than a repository so the appointment and slot-hold
 * modules can both use it without depending on DoctorModule — either direction
 * of module import would close a cycle.
 *
 * Note this deliberately does NOT check the booking horizon or whether the
 * instant is in the past: those belong to the caller's own policy.
 */
export async function findOfferedSlot(
  manager: EntityManager,
  doctorId: string,
  clinicId: string,
  scheduledAt: Date,
): Promise<OfferedSlot | null> {
  const row = await manager
    .createQueryBuilder(DoctorClinicOrmEntity, 'pairing')
    .innerJoin(ClinicOrmEntity, 'clinic', 'clinic.id = pairing.clinicId')
    .innerJoin(DoctorOrmEntity, 'doctor', 'doctor.id = pairing.doctorId')
    .innerJoin(
      DoctorClinicScheduleOrmEntity,
      'schedule',
      'schedule.doctorClinicId = pairing.id',
    )
    .select('schedule.slotMinutes', 'slotMinutes')
    .addSelect('pairing.fee', 'fee')
    .where('pairing.doctorId = :doctorId', { doctorId })
    .andWhere('pairing.clinicId = :clinicId', { clinicId })
    // The same gate the profile and availability apply, so a slot can never be
    // held on a pairing whose profile 404s.
    .andWhere('pairing.isActive = true')
    .andWhere('clinic.isActive = true')
    .andWhere('doctor.isVerified = true')
    // 0 = Sunday on both sides: EXTRACT(DOW) and our own dayOfWeek.
    .andWhere(`schedule.dayOfWeek = EXTRACT(DOW FROM ${LOCAL})`)
    .andWhere(`schedule.startTime <= CAST(${LOCAL} AS time)`)
    // A slot must finish inside the posted hours — never offer a time the
    // doctor cannot see the patient through.
    .andWhere(
      `CAST(${LOCAL} AS time) <= schedule.endTime - make_interval(mins => schedule.slotMinutes)`,
    )
    // And it must sit on the grid, a whole number of slots after opening.
    .andWhere(
      `MOD(CAST(EXTRACT(EPOCH FROM (CAST(${LOCAL} AS time) - schedule.startTime)) AS int), schedule.slotMinutes * 60) = 0`,
    )
    // Leave is whole days and personal to the doctor, so it applies here too.
    // Identifiers are spelled out rather than written `pairing.doctorId`:
    // TypeORM's alias replacement does not reach inside a subquery, and an
    // unquoted camelCase column folds to lower case and fails to resolve.
    .andWhere(
      `NOT EXISTS (
         SELECT 1 FROM doctor_leaves "leave"
         WHERE "leave"."doctorId" = "pairing"."doctorId"
           AND CAST(${LOCAL} AS date) BETWEEN "leave"."startDate" AND "leave"."endDate"
       )`,
    )
    .setParameter('scheduledAt', scheduledAt)
    // Overlapping schedule rows resolve the same way slot generation does:
    // the one that opens earliest wins.
    .orderBy('schedule.startTime', 'ASC')
    .getRawOne<{ slotMinutes: number; fee: string }>();

  return row ? { slotMinutes: row.slotMinutes, fee: Number(row.fee) } : null;
}
