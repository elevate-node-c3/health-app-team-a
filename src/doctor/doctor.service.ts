import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { APPOINTMENT_REPOSITORY } from 'src/appointment/domain/repositories/appointment.repository';
import { User } from 'src/auth/domain/entities/user.model';
import {
  addDays,
  localDateOf,
  localMonthOf,
  monthBounds,
  shiftMonth,
  wallClockToInstant,
} from 'src/common/utils/clinic-time.util';
import { DOCTOR_LEAVE_REPOSITORY } from 'src/doctor/domain/repositories/doctor-leave.repository';
import { DOCTOR_REPOSITORY } from 'src/doctor/domain/repositories/doctor.repository';
import { FAVOURITE_REPOSITORY } from 'src/favourite/domain/repositories/favourite.repository';

import {
  AVAILABILITY_STALE_AFTER_SECONDS,
  BOOKING_HORIZON_DAYS,
} from './availability.constants';
import { buildAvailability } from './availability.util';
import {
  DOCTOR_PROFILE_VIEWED_EVENT,
  DoctorProfileViewedEvent,
} from './doctor.events';

import type {
  AvailabilityDay,
  AvailabilityResponse,
  BookingWindow,
  DoctorProfileResponse,
} from './doctor.types';
import type { AvailabilityQueryDto } from './dto/availability-query.dto';
import type { AppointmentRepository } from 'src/appointment/domain/repositories/appointment.repository';
import type { DoctorLeaveRepository } from 'src/doctor/domain/repositories/doctor-leave.repository';
import type {
  BookablePairing,
  DoctorProfileRow,
  DoctorRepository,
} from 'src/doctor/domain/repositories/doctor.repository';
import type { FavouriteRepository } from 'src/favourite/domain/repositories/favourite.repository';

/** The inclusive dates a patient may book, in one clinic's own zone. */
interface Horizon {
  earliestDate: string;
  latestDate: string;
}

@Injectable()
export class DoctorService {
  constructor(
    @Inject(DOCTOR_REPOSITORY)
    private readonly doctorRepository: DoctorRepository,
    @Inject(DOCTOR_LEAVE_REPOSITORY)
    private readonly doctorLeaveRepository: DoctorLeaveRepository,
    @Inject(APPOINTMENT_REPOSITORY)
    private readonly appointmentRepository: AppointmentRepository,
    @Inject(FAVOURITE_REPOSITORY)
    private readonly favouriteRepository: FavouriteRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /** The doctor profile screen: who they are, where they sit, what they charge. */
  async getProfile(
    doctorId: string,
    user: User | null,
    now: Date = new Date(),
  ): Promise<DoctorProfileResponse> {
    const profile = await this.doctorRepository.findProfileById(doctorId);
    // An unverified doctor is indistinguishable from a missing one: a patient
    // has no business learning that an unverified profile exists.
    if (!profile) throw new NotFoundException('Doctor not found');

    // Fire-and-forget analytics — the listener runs asynchronously. Emitted
    // here only, so paging through months does not inflate the view count.
    this.eventEmitter.emit(DOCTOR_PROFILE_VIEWED_EVENT, {
      doctorId,
      userId: user?.id ?? null,
      at: now,
    } satisfies DoctorProfileViewedEvent);

    const response = this.toProfileResponse(profile);

    if (user) {
      response.isFavourite = await this.favouriteRepository.exists(
        user.id,
        doctorId,
      );
    }

    return response;
  }

  /**
   * A month of real times for one doctor at one clinic.
   *
   * This is a snapshot of what was free when it was built, not a reservation —
   * nothing here stops someone else taking the same time a second later.
   */
  async getAvailability(
    doctorId: string,
    dto: AvailabilityQueryDto,
    now: Date = new Date(),
  ): Promise<AvailabilityResponse> {
    const pairing = await this.doctorRepository.findBookablePairing(
      doctorId,
      dto.clinicId,
    );
    // The bookable-pairing gate: an inactive pairing, an inactive clinic or an
    // unverified doctor exposes no availability at all.
    if (!pairing) throw new NotFoundException('Doctor not bookable at clinic');

    const timezone = pairing.clinic.timezone;
    const month = dto.month ?? localMonthOf(now, timezone);
    const horizon = this.horizonOf(now, timezone);

    const { first, last } = monthBounds(month);
    // Clamp the requested month to the horizon. A month wholly outside it is
    // not an error — it comes back empty with the arrows still correct, so the
    // client can navigate out of it.
    const fromDate = max(first, horizon.earliestDate);
    const toDate = min(last, horizon.latestDate);

    const days =
      fromDate > toDate
        ? []
        : await this.buildDays(pairing, fromDate, toDate, doctorId, now);

    const totalSlots = days.reduce((sum, day) => sum + day.slots.length, 0);
    const takenSlots = days.reduce(
      (sum, day) => sum + day.slots.filter((slot) => slot.isTaken).length,
      0,
    );

    return {
      data: days,
      meta: {
        doctorId,
        clinicId: dto.clinicId,
        month,
        fee: pairing.fee,
        feeCurrency: 'EGP',
        timezone,
        generatedAt: now,
        staleAfterSeconds: AVAILABILITY_STALE_AFTER_SECONDS,
        isReservation: false,
        booking: {
          horizonDays: BOOKING_HORIZON_DAYS,
          earliestDate: horizon.earliestDate,
          latestDate: horizon.latestDate,
          timezone,
        } satisfies BookingWindow,
        // The arrows read the same horizon the slots did, so a patient can
        // never navigate to a month they are not allowed to book in.
        canGoPrevious: this.monthIntersectsHorizon(
          shiftMonth(month, -1),
          horizon,
        ),
        canGoNext: this.monthIntersectsHorizon(shiftMonth(month, 1), horizon),
        totalSlots,
        availableSlots: totalSlots - takenSlots,
        takenSlots,
      },
    };
  }

  private async buildDays(
    pairing: BookablePairing,
    fromDate: string,
    toDate: string,
    doctorId: string,
    now: Date,
  ): Promise<AvailabilityDay[]> {
    const timezone = pairing.clinic.timezone;

    // Bound the booking lookup by the window's own instants. The end is the
    // start of the day after `toDate`, so the last day is fully covered.
    const from = startOfDayInstant(fromDate, timezone);
    const to = startOfDayInstant(addDays(toDate, 1), timezone);

    const [leaves, booked] = await Promise.all([
      this.doctorLeaveRepository.findOverlapping(doctorId, fromDate, toDate),
      this.appointmentRepository.findBookedInstants(
        doctorId,
        pairing.clinic.id,
        from,
        to,
      ),
    ]);

    return buildAvailability({
      timezone,
      schedules: pairing.schedules,
      leaves,
      booked,
      fromDate,
      toDate,
      now,
    });
  }

  /** Today through today plus the horizon, on the clinic's own calendar. */
  private horizonOf(now: Date, timezone: string): Horizon {
    const earliestDate = localDateOf(now, timezone);
    return {
      earliestDate,
      latestDate: addDays(earliestDate, BOOKING_HORIZON_DAYS),
    };
  }

  private monthIntersectsHorizon(month: string, horizon: Horizon): boolean {
    const { first, last } = monthBounds(month);
    return first <= horizon.latestDate && last >= horizon.earliestDate;
  }

  private toProfileResponse(profile: DoctorProfileRow): DoctorProfileResponse {
    const { doctor, specialtyName, clinics } = profile;

    return {
      id: doctor.id,
      name: doctor.name,
      photo: doctor.photo,
      title: doctor.title,
      specialty: specialtyName,
      subspecialties: doctor.subspecialties,
      university: doctor.university,
      yearsOfExperience: doctor.yearsOfExperience,
      patientsCount: doctor.patientsCount,
      gender: doctor.gender,
      rating: doctor.hasRatings
        ? { average: doctor.ratingAverage, count: doctor.ratingCount }
        : null,
      clinics: clinics.map(({ doctorClinicId, clinic, fee }) => ({
        doctorClinicId,
        id: clinic.id,
        name: clinic.name,
        placeType: clinic.placeType,
        governorate: clinic.governorate,
        city: clinic.city,
        latitude: clinic.latitude,
        longitude: clinic.longitude,
        fee,
        feeCurrency: 'EGP',
        timezone: clinic.timezone,
      })),
      booking: { horizonDays: BOOKING_HORIZON_DAYS },
    };
  }
}

/**
 * Midnight on a clinic-local date. Falls forward to the first wall time that
 * exists when a DST spring-forward swallowed midnight itself.
 */
function startOfDayInstant(isoDate: string, timezone: string): Date {
  const midnight = wallClockToInstant(isoDate, '00:00', timezone);
  if (midnight) return midnight;

  for (let minutes = 15; minutes < 24 * 60; minutes += 15) {
    const hour = Math.floor(minutes / 60);
    const minute = minutes % 60;
    const instant = wallClockToInstant(
      isoDate,
      `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
      timezone,
    );
    if (instant) return instant;
  }

  throw new Error(`No valid wall-clock time on ${isoDate} in ${timezone}`);
}

/** ISO dates sort lexicographically, so plain string comparison is correct. */
function max(left: string, right: string): string {
  return left >= right ? left : right;
}

function min(left: string, right: string): string {
  return left <= right ? left : right;
}
