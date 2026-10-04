import {
  DEFAULT_TIMEZONE,
  dayOfWeekOf,
  localDateOf,
} from 'src/common/utils/clinic-time.util';
import { MapClinicResult } from 'src/search/domain/entities/map-clinic-result.model';

import type { DoctorOrmEntity } from 'src/doctor/infrastructure/entities/typeorm/doctor.entity';
import type { SelectQueryBuilder } from 'typeorm';

/**
 * Filter composition shared by list search and map search.
 *
 * Both build on the same `doctor` query and offer the same filters; only the
 * projection and ranking differ. Keeping the predicates here means a filter
 * fixed for one view cannot silently stay broken in the other.
 */

/**
 * `maxPrice` at this value means "and above", so no upper bound is applied — it
 * is the top stop of the client's price slider, not a real ceiling.
 */
export const UNBOUNDED_MAX_PRICE = 1000;

/** Escapes the LIKE wildcards so a user's `%` or `_` matches literally. */
export const escapeLikeTerm = (term: string): string =>
  term.replace(/[\\%_]/g, '\\$&');

/** Doctor-table filters that need no join. */
export interface DoctorScalarFilters {
  query?: string;
  genders?: string[];
  titles?: string[];
  rating?: number;
}

/** Clinic and pairing filters, all of which need the doctor_clinics join. */
export interface ClinicFilters {
  places?: string[];
  governorate?: string;
  city?: string;
  minPrice?: number;
  maxPrice?: number;
}

/** Whether any clinic filter is set, and so whether the join is needed. */
export function needsClinicJoin(filters: ClinicFilters): boolean {
  return Boolean(
    filters.places?.length ||
    filters.governorate ||
    filters.city ||
    filters.minPrice !== undefined ||
    filters.maxPrice !== undefined,
  );
}

/**
 * Joins doctor_clinics and clinics under the aliases `dc` and `clinic`.
 *
 * Inner joins, and both `isActive` conditions sit in the ON clause: an inactive
 * pairing or a closed clinic must remove the row entirely, not merely blank it.
 */
export function joinClinics(qb: SelectQueryBuilder<DoctorOrmEntity>): void {
  qb.innerJoin(
    'doctor_clinics',
    'dc',
    'dc.doctorId = doctor.id AND dc.isActive = true',
  ).innerJoin(
    'clinics',
    'clinic',
    'clinic.id = dc.clinicId AND clinic.isActive = true',
  );
}

export function applyDoctorScalarFilters(
  qb: SelectQueryBuilder<DoctorOrmEntity>,
  filters: DoctorScalarFilters,
): void {
  if (filters.query) {
    qb.andWhere("LOWER(doctor.name) LIKE :pattern ESCAPE '\\'", {
      pattern: `%${escapeLikeTerm(filters.query.toLowerCase())}%`,
    });
  }

  if (filters.genders && filters.genders.length > 0) {
    qb.andWhere('doctor.gender IN (:...genders)', { genders: filters.genders });
  }

  if (filters.titles && filters.titles.length > 0) {
    qb.andWhere('doctor.title IN (:...titles)', { titles: filters.titles });
  }

  if (filters.rating) {
    qb.andWhere('doctor.ratingAverage >= :rating', { rating: filters.rating });
  }
}

/**
 * Matches a specialty by id or by name, so the client may pass either without
 * a prior lookup. Expects a `specialty` alias to be joined already.
 */
export function applySpecialtyFilter(
  qb: SelectQueryBuilder<DoctorOrmEntity>,
  specialty: string | undefined,
): void {
  if (!specialty) return;

  qb.andWhere('(specialty.id = :specialty OR specialty.name = :specialty)', {
    specialty,
  });
}

/**
 * The clinic-scoped filters. Expects `dc` and `clinic` to be joined — call
 * `joinClinics` first, or ensure the caller joined them itself.
 */
export function applyClinicFilters(
  qb: SelectQueryBuilder<DoctorOrmEntity>,
  filters: ClinicFilters,
): void {
  if (filters.places && filters.places.length > 0) {
    qb.andWhere('clinic.placeType IN (:...places)', { places: filters.places });
  }

  if (filters.governorate) {
    qb.andWhere('clinic.governorate = :governorate', {
      governorate: filters.governorate,
    });
  }

  if (filters.city) {
    qb.andWhere('clinic.city = :city', { city: filters.city });
  }

  if (filters.minPrice !== undefined) {
    qb.andWhere('dc.fee >= :minPrice', { minPrice: filters.minPrice });
  }

  if (
    filters.maxPrice !== undefined &&
    filters.maxPrice < UNBOUNDED_MAX_PRICE
  ) {
    qb.andWhere('dc.fee <= :maxPrice', { maxPrice: filters.maxPrice });
  }
}

/**
 * Which weekdays an availability filter asks about, or an empty list when it
 * imposes no constraint ("Any Day", or nothing selected). "Today" is decided on
 * the Cairo clock, not the server's — see DEFAULT_TIMEZONE.
 */
function availabilityDaysOfWeek(availability: string[] | undefined): number[] {
  if (!availability || availability.length === 0) return [];
  if (availability.includes('Any Day')) return [];

  // Search spans many clinics at once, so there is no single clinic zone to
  // resolve "today" in; the app's default zone is the honest choice here.
  const currentDayOfWeek = dayOfWeekOf(
    localDateOf(new Date(), DEFAULT_TIMEZONE),
  );

  const daysToCheck: number[] = [];
  if (availability.includes('Today')) daysToCheck.push(currentDayOfWeek);
  if (availability.includes('Tomorrow'))
    daysToCheck.push((currentDayOfWeek + 1) % 7);

  return daysToCheck;
}

/**
 * Availability filter (Today/Tomorrow).
 *
 * Expressed as EXISTS rather than a join: a doctor with several schedule rows
 * would otherwise multiply the result rows, which silently corrupted paging and
 * counts. EXISTS also needs no alias from the outer query, so the filter works
 * whether or not the caller joined doctor_clinics.
 *
 * `correlateOn` picks the subject: the list returns doctors, so any bookable
 * pairing counts; the map returns one row per doctor-at-clinic, so only that
 * row's own pairing counts.
 */
export function applyAvailabilityFilter(
  qb: SelectQueryBuilder<DoctorOrmEntity>,
  availability: string[] | undefined,
  correlateOn: 'doctor' | 'pairing',
): void {
  const daysToCheck = availabilityDaysOfWeek(availability);
  if (daysToCheck.length === 0) return;

  const correlation =
    correlateOn === 'pairing'
      ? 'dcAvail.id = dc.id'
      : 'dcAvail."doctorId" = doctor.id';

  qb.andWhere(
    `EXISTS (
        SELECT 1
        FROM doctor_clinic_schedules dcsAvail
        INNER JOIN doctor_clinics dcAvail ON dcAvail.id = dcsAvail."doctorClinicId"
        INNER JOIN clinics clinicAvail ON clinicAvail.id = dcAvail."clinicId"
        WHERE ${correlation}
          AND dcAvail."isActive" = true
          AND clinicAvail."isActive" = true
          AND dcsAvail."dayOfWeek" IN (:...availabilityDays)
      )`,
    { availabilityDays: daysToCheck },
  );
}

/** Raw row shape returned by the map `getRawMany` (all numerics as strings). */
export interface MapRawRow {
  doctorClinicId: string;
  clinicId: string;
  clinicName: string;
  placeType: string;
  governorate: string;
  city: string;
  latitude: string;
  longitude: string;
  doctorId: string;
  doctorName: string;
  doctorPhoto: string | null;
  title: string;
  specialtyName: string | null;
  ratingAverage: string;
  ratingCount: string;
  fee: string;
  distanceMeters: string | null;
}

/**
 * Builds the domain result from one raw map row. Isolated because the
 * constructor takes seventeen positional arguments: inline at the call site,
 * one transposed pair would be invisible.
 */
export function toMapClinicResult(row: MapRawRow): MapClinicResult {
  return new MapClinicResult(
    row.doctorClinicId,
    row.clinicId,
    row.clinicName,
    row.placeType as MapClinicResult['placeType'],
    row.governorate,
    row.city,
    Number(row.latitude),
    Number(row.longitude),
    row.doctorId,
    row.doctorName,
    row.doctorPhoto,
    row.title as MapClinicResult['title'],
    row.specialtyName ?? '',
    Number(row.ratingAverage),
    Number(row.ratingCount),
    Number(row.fee),
    row.distanceMeters === null ? null : Number(row.distanceMeters),
  );
}
