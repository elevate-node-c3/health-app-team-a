import {
  dateRange,
  dayOfWeekOf,
  instantToLocalTime,
  minutesToTime,
  timeToMinutes,
  wallClockToInstant,
} from 'src/common/utils/clinic-time.util';

import { DEFAULT_BOOKED_DURATION_MINUTES } from './availability.constants';

import type { AvailabilityDay, AvailabilitySlot } from './doctor.types';
import type { BookedInstant } from 'src/appointment/domain/repositories/appointment.repository';
import type { DoctorClinicSchedule } from 'src/doctor/domain/entities/doctor-clinic-schedule.model';
import type { DoctorLeave } from 'src/doctor/domain/entities/doctor-leave.model';
import type { HeldInstant } from 'src/doctor/domain/repositories/hold.repository';

export interface BuildAvailabilityInput {
  /** The clinic's IANA zone — its posted hours are written on this clock. */
  timezone: string;
  schedules: DoctorClinicSchedule[];
  leaves: DoctorLeave[];
  booked: BookedInstant[];
  /** Times a live hold has taken while someone pays for them. */
  held: HeldInstant[];
  /** Inclusive clinic-local window, already clamped to the booking horizon. */
  fromDate: string;
  toDate: string;
  /** Slots at or before this instant have passed and are not offered. */
  now: Date;
}

/** A booking expanded into the half-open instant range it occupies. */
interface BookedRange {
  startMs: number;
  endMs: number;
  durationMinutes: number;
  /** Cleared once the booking has been matched to a generated slot. */
  matched: boolean;
}

/**
 * Turns recurring weekly hours into the individual times a patient can pick,
 * for every clinic-local date in the window.
 *
 * Pure and clock-injected: every rule that decides whether a time is offered
 * lives here, so it can be reasoned about without a database.
 */
export function buildAvailability(
  input: BuildAvailabilityInput,
): AvailabilityDay[] {
  const { timezone, schedules, leaves, booked, held, fromDate, toDate, now } =
    input;

  const schedulesByDay = groupSchedulesByDay(schedules);
  const nowMs = now.getTime();

  return dateRange(fromDate, toDate).map((date) => {
    const dayOfWeek = dayOfWeekOf(date);
    const isOnLeave = leaves.some((leave) => leave.covers(date));
    const daySchedules = schedulesByDay.get(dayOfWeek) ?? [];

    // Bookings are expanded per day so a day's own slot length can supply the
    // fallback duration for a booking that predates the column.
    const dayRanges = expandBookings(booked, date, daySchedules, timezone);
    const heldRanges = expandBookings(held, date, daySchedules, timezone);

    // On leave no new slots are generated, but the bookings below still are:
    // an appointment made before the leave was entered is still real, and the
    // day must not look emptier than it is.
    const slots = isOnLeave
      ? []
      : generateSlots(daySchedules, date, timezone, dayRanges, heldRanges);

    // Any booking that matched no generated slot is surfaced in its own right,
    // so a booked time is never silently dropped. Holds get no such treatment:
    // an appointment is permanent, while a hold lapses in minutes and would
    // leave a phantom time behind in a response the client may still be showing.
    for (const range of dayRanges) {
      if (range.matched) continue;
      const at = new Date(range.startMs);
      slots.push({
        at,
        localTime: instantToLocalTime(at, timezone),
        durationMinutes: range.durationMinutes,
        isTaken: true,
        isOffSchedule: true,
      });
    }

    return {
      date,
      dayOfWeek,
      isOnLeave,
      // Past times are outside the bookable window whether taken or not.
      slots: slots
        .filter((slot) => slot.at.getTime() > nowMs)
        .sort((left, right) => left.at.getTime() - right.at.getTime()),
    };
  });
}

/**
 * Steps each of the day's schedule windows into slots. A trailing remainder
 * shorter than the slot length is dropped — never offer a time the doctor
 * cannot see the patient through.
 */
function generateSlots(
  daySchedules: DoctorClinicSchedule[],
  date: string,
  timezone: string,
  dayRanges: BookedRange[],
  heldRanges: BookedRange[],
): AvailabilitySlot[] {
  const slots: AvailabilitySlot[] = [];
  // Overlapping schedule rows must not emit the same instant twice.
  const seen = new Set<number>();

  for (const schedule of daySchedules) {
    const windowEnd = timeToMinutes(schedule.endTime);
    const slotMinutes = schedule.slotMinutes;
    if (slotMinutes <= 0) continue;

    for (
      let cursor = timeToMinutes(schedule.startTime);
      cursor + slotMinutes <= windowEnd;
      cursor += slotMinutes
    ) {
      const at = wallClockToInstant(date, minutesToTime(cursor), timezone);
      // Null means a DST spring-forward swallowed this wall time; it does not
      // exist, so it cannot be booked.
      if (at === null) continue;

      const startMs = at.getTime();
      if (seen.has(startMs)) continue;
      seen.add(startMs);

      const isBooked = markOverlapping(dayRanges, startMs, slotMinutes);
      const isHeld = markOverlapping(heldRanges, startMs, slotMinutes);

      slots.push({
        at,
        localTime: instantToLocalTime(at, timezone),
        durationMinutes: slotMinutes,
        isTaken: isBooked || isHeld,
        // A booking is the stronger truth, so only an unbooked slot is
        // reported as merely held.
        ...(isHeld && !isBooked ? { isHeld: true } : {}),
      });
    }
  }

  return slots;
}

/**
 * Whether any booking overlaps this slot. Overlap rather than an exact start
 * match, so a booking left behind by a slot-length or opening-hours change
 * still blocks the time it really occupies.
 *
 * Only a booking that starts exactly when the slot does counts as sitting on
 * the grid. One that merely overlaps is still off-grid and is surfaced in its
 * own right, so the patient can see the real shape of the day.
 */
function markOverlapping(
  dayRanges: BookedRange[],
  slotStartMs: number,
  slotMinutes: number,
): boolean {
  const slotEndMs = slotStartMs + slotMinutes * 60_000;
  let isTaken = false;

  for (const range of dayRanges) {
    if (slotStartMs < range.endMs && range.startMs < slotEndMs) {
      isTaken = true;
      if (range.startMs === slotStartMs) range.matched = true;
    }
  }

  return isTaken;
}

/**
 * The bookings — or holds, which have the same shape — that fall on this
 * clinic-local date, as instant ranges.
 */
function expandBookings(
  booked: (BookedInstant | HeldInstant)[],
  date: string,
  daySchedules: DoctorClinicSchedule[],
  timezone: string,
): BookedRange[] {
  const dayStart = wallClockToInstant(date, '00:00', timezone);
  // A date whose midnight does not exist is still a real day; fall back to the
  // earliest wall time that does.
  const startMs = (dayStart ?? firstValidInstant(date, timezone)).getTime();
  const endMs = startMs + 26 * 3_600_000;

  // The day's own slot length is the best guess for a booking that never
  // recorded its duration; schedules for this weekday agree often enough.
  const fallbackMinutes =
    daySchedules[0]?.slotMinutes ?? DEFAULT_BOOKED_DURATION_MINUTES;

  return booked
    .filter((instant) => {
      const ms = instant.scheduledAt.getTime();
      return ms >= startMs && ms < endMs;
    })
    .map((instant) => {
      const durationMinutes = instant.durationMinutes ?? fallbackMinutes;
      const bookingStartMs = instant.scheduledAt.getTime();
      return {
        startMs: bookingStartMs,
        endMs: bookingStartMs + durationMinutes * 60_000,
        durationMinutes,
        matched: false,
      };
    });
}

/**
 * The first wall time on this date that actually exists. Only reached on a
 * spring-forward date whose midnight is inside the gap.
 */
function firstValidInstant(date: string, timezone: string): Date {
  for (let minutes = 0; minutes < 24 * 60; minutes += 15) {
    const instant = wallClockToInstant(date, minutesToTime(minutes), timezone);
    if (instant !== null) return instant;
  }
  throw new Error(`No valid wall-clock time on ${date} in ${timezone}`);
}

function groupSchedulesByDay(
  schedules: DoctorClinicSchedule[],
): Map<number, DoctorClinicSchedule[]> {
  const byDay = new Map<number, DoctorClinicSchedule[]>();

  for (const schedule of schedules) {
    const existing = byDay.get(schedule.dayOfWeek);
    if (existing) existing.push(schedule);
    else byDay.set(schedule.dayOfWeek, [schedule]);
  }

  // Deterministic slot order regardless of how the rows arrived.
  for (const daySchedules of byDay.values()) {
    daySchedules.sort((left, right) =>
      left.startTime.localeCompare(right.startTime),
    );
  }

  return byDay;
}
