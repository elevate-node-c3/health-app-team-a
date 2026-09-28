import { describe, expect, it } from '@jest/globals';
import { DoctorClinicSchedule } from 'src/doctor/domain/entities/doctor-clinic-schedule.model';
import { DoctorLeave } from 'src/doctor/domain/entities/doctor-leave.model';

import { buildAvailability } from './availability.util';

import type { BookedInstant } from 'src/appointment/domain/repositories/appointment.repository';

const CAIRO = 'Africa/Cairo';

/** 2026-10-03 is a Saturday; 2026-10-06 is a Tuesday. */
const SATURDAY = 6;
const TUESDAY = 2;

/** Before every October date under test, so nothing is filtered out as past. */
const EARLY = new Date('2026-09-01T00:00:00.000Z');
/** Before the April DST transition dates, which precede EARLY. */
const EARLY_SPRING = new Date('2026-04-01T00:00:00.000Z');

function makeSchedule(
  overrides: Partial<{
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    slotMinutes: number;
  }> = {},
): DoctorClinicSchedule {
  return new DoctorClinicSchedule(
    'sched-1',
    'pairing-1',
    overrides.dayOfWeek ?? SATURDAY,
    overrides.startTime ?? '09:00:00',
    overrides.endTime ?? '13:00:00',
    overrides.slotMinutes ?? 30,
    new Date(),
    new Date(),
  );
}

function makeLeave(startDate: string, endDate: string): DoctorLeave {
  return new DoctorLeave(
    'leave-1',
    'doctor-1',
    startDate,
    endDate,
    'Annual leave',
    new Date(),
    new Date(),
  );
}

function booked(
  iso: string,
  durationMinutes: number | null = null,
): BookedInstant {
  return { scheduledAt: new Date(iso), durationMinutes };
}

describe('buildAvailability', () => {
  describe('turning recurring hours into individual times', () => {
    it('splits a 09:00-13:00 window into eight 30-minute slots', () => {
      const [day] = buildAvailability({
        timezone: CAIRO,
        schedules: [makeSchedule()],
        leaves: [],
        booked: [],
        fromDate: '2026-10-03',
        toDate: '2026-10-03',
        now: EARLY,
      });

      expect(day.slots).toHaveLength(8);
      expect(day.slots.map((slot) => slot.localTime)).toEqual([
        '09:00',
        '09:30',
        '10:00',
        '10:30',
        '11:00',
        '11:30',
        '12:00',
        '12:30',
      ]);
      // 09:00 Cairo in DST is 06:00Z — the client gets the instant, the clinic
      // keeps its own clock.
      expect(day.slots[0].at).toEqual(new Date('2026-10-03T06:00:00.000Z'));
      expect(day.slots.every((slot) => slot.durationMinutes === 30)).toBe(true);
    });

    it('drops a trailing remainder too short for a full slot', () => {
      // 09:00-10:10 at 30min fits two slots; the last 10 minutes are not an
      // appointment the doctor could honour.
      const [day] = buildAvailability({
        timezone: CAIRO,
        schedules: [makeSchedule({ endTime: '10:10:00' })],
        leaves: [],
        booked: [],
        fromDate: '2026-10-03',
        toDate: '2026-10-03',
        now: EARLY,
      });

      expect(day.slots.map((slot) => slot.localTime)).toEqual([
        '09:00',
        '09:30',
      ]);
    });

    it('applies each schedule row its own slot length', () => {
      const days = buildAvailability({
        timezone: CAIRO,
        schedules: [
          makeSchedule({ dayOfWeek: SATURDAY, slotMinutes: 30 }),
          makeSchedule({
            dayOfWeek: TUESDAY,
            startTime: '17:00:00',
            endTime: '20:00:00',
            slotMinutes: 20,
          }),
        ],
        leaves: [],
        booked: [],
        fromDate: '2026-10-03',
        toDate: '2026-10-06',
        now: EARLY,
      });

      const saturday = days.find((day) => day.date === '2026-10-03');
      const tuesday = days.find((day) => day.date === '2026-10-06');

      expect(saturday?.slots).toHaveLength(8);
      expect(tuesday?.slots).toHaveLength(9);
      expect(tuesday?.slots[0].localTime).toBe('17:00');
      expect(tuesday?.slots[1].localTime).toBe('17:20');
      expect(tuesday?.slots.every((slot) => slot.durationMinutes === 20)).toBe(
        true,
      );
    });

    it('returns a day with no slots for a weekday the doctor does not work', () => {
      const days = buildAvailability({
        timezone: CAIRO,
        schedules: [makeSchedule({ dayOfWeek: SATURDAY })],
        leaves: [],
        booked: [],
        fromDate: '2026-10-04',
        toDate: '2026-10-05',
        now: EARLY,
      });

      // Still present, so the calendar can grey them out without another call.
      expect(days).toHaveLength(2);
      expect(days.every((day) => day.slots.length === 0)).toBe(true);
      expect(days.every((day) => day.isOnLeave === false)).toBe(true);
    });

    it('does not emit the same instant twice when schedule rows overlap', () => {
      const days = buildAvailability({
        timezone: CAIRO,
        schedules: [
          makeSchedule({ startTime: '09:00:00', endTime: '11:00:00' }),
          makeSchedule({ startTime: '10:00:00', endTime: '12:00:00' }),
        ],
        leaves: [],
        booked: [],
        fromDate: '2026-10-03',
        toDate: '2026-10-03',
        now: EARLY,
      });

      const times = days[0].slots.map((slot) => slot.localTime);
      expect(times).toEqual([...new Set(times)]);
      expect(times).toEqual([
        '09:00',
        '09:30',
        '10:00',
        '10:30',
        '11:00',
        '11:30',
      ]);
    });
  });

  describe('booked times', () => {
    it('returns a booked time marked taken rather than omitting it', () => {
      const [day] = buildAvailability({
        timezone: CAIRO,
        schedules: [makeSchedule()],
        leaves: [],
        booked: [booked('2026-10-03T07:00:00.000Z', 30)], // 10:00 Cairo
        fromDate: '2026-10-03',
        toDate: '2026-10-03',
        now: EARLY,
      });

      expect(day.slots).toHaveLength(8);
      const taken = day.slots.filter((slot) => slot.isTaken);
      expect(taken).toHaveLength(1);
      expect(taken[0].localTime).toBe('10:00');
      expect(taken[0].isOffSchedule).toBeUndefined();
    });

    it('ignores a booking that belongs to another day', () => {
      const [day] = buildAvailability({
        timezone: CAIRO,
        schedules: [makeSchedule()],
        leaves: [],
        booked: [booked('2026-10-10T07:00:00.000Z', 30)],
        fromDate: '2026-10-03',
        toDate: '2026-10-03',
        now: EARLY,
      });

      expect(day.slots.some((slot) => slot.isTaken)).toBe(false);
    });
  });

  describe('bookings left off the grid by a schedule change', () => {
    it('surfaces an off-grid booking and blocks the slots it overlaps', () => {
      // Booked at 09:15 Cairo for 30 minutes, so it runs into the 09:00 and
      // 09:30 slots of the current grid.
      const [day] = buildAvailability({
        timezone: CAIRO,
        schedules: [makeSchedule()],
        leaves: [],
        booked: [booked('2026-10-03T06:15:00.000Z', 30)],
        fromDate: '2026-10-03',
        toDate: '2026-10-03',
        now: EARLY,
      });

      const offSchedule = day.slots.filter((slot) => slot.isOffSchedule);
      expect(offSchedule).toHaveLength(1);
      expect(offSchedule[0].localTime).toBe('09:15');
      expect(offSchedule[0].isTaken).toBe(true);

      const byTime = new Map(day.slots.map((slot) => [slot.localTime, slot]));
      expect(byTime.get('09:00')?.isTaken).toBe(true);
      expect(byTime.get('09:30')?.isTaken).toBe(true);
      expect(byTime.get('10:00')?.isTaken).toBe(false);
      // Sorted by instant, so the off-grid time sits between its neighbours.
      expect(day.slots.map((slot) => slot.localTime).slice(0, 3)).toEqual([
        '09:00',
        '09:15',
        '09:30',
      ]);
    });

    it('keeps a booking that now falls entirely outside opening hours', () => {
      // The clinic moved to 10:00-13:00; an 09:00 booking predates the change.
      const [day] = buildAvailability({
        timezone: CAIRO,
        schedules: [makeSchedule({ startTime: '10:00:00' })],
        leaves: [],
        booked: [booked('2026-10-03T06:00:00.000Z', 30)], // 09:00 Cairo
        fromDate: '2026-10-03',
        toDate: '2026-10-03',
        now: EARLY,
      });

      const first = day.slots[0];
      expect(first.localTime).toBe('09:00');
      expect(first.isTaken).toBe(true);
      expect(first.isOffSchedule).toBe(true);
      // The new grid is otherwise untouched.
      expect(day.slots.filter((slot) => !slot.isOffSchedule)).toHaveLength(6);
    });

    it('lets one 30-minute booking block two 20-minute slots after a length change', () => {
      // The doctor moved from 30 to 20 minutes; the existing booking still
      // occupies the half hour it was made for.
      const [day] = buildAvailability({
        timezone: CAIRO,
        schedules: [makeSchedule({ slotMinutes: 20 })],
        leaves: [],
        booked: [booked('2026-10-03T06:00:00.000Z', 30)], // 09:00-09:30 Cairo
        fromDate: '2026-10-03',
        toDate: '2026-10-03',
        now: EARLY,
      });

      const byTime = new Map(day.slots.map((slot) => [slot.localTime, slot]));
      expect(byTime.get('09:00')?.isTaken).toBe(true);
      expect(byTime.get('09:20')?.isTaken).toBe(true);
      expect(byTime.get('09:40')?.isTaken).toBe(false);
    });

    it('falls back to the day slot length when a booking never recorded one', () => {
      const [day] = buildAvailability({
        timezone: CAIRO,
        schedules: [makeSchedule({ slotMinutes: 30 })],
        leaves: [],
        booked: [booked('2026-10-03T06:00:00.000Z', null)],
        fromDate: '2026-10-03',
        toDate: '2026-10-03',
        now: EARLY,
      });

      const byTime = new Map(day.slots.map((slot) => [slot.localTime, slot]));
      expect(byTime.get('09:00')?.isTaken).toBe(true);
      expect(byTime.get('09:30')?.isTaken).toBe(false);
    });
  });

  describe('leave', () => {
    it('generates no slots on a leave day', () => {
      const days = buildAvailability({
        timezone: CAIRO,
        schedules: [makeSchedule()],
        leaves: [makeLeave('2026-10-01', '2026-10-07')],
        booked: [],
        fromDate: '2026-10-03',
        toDate: '2026-10-03',
        now: EARLY,
      });

      expect(days[0].isOnLeave).toBe(true);
      expect(days[0].slots).toEqual([]);
    });

    it('still shows an existing booking on a leave day', () => {
      // Leave entered after the appointment was made — the patient still has
      // that time, so the day must not appear empty.
      const days = buildAvailability({
        timezone: CAIRO,
        schedules: [makeSchedule()],
        leaves: [makeLeave('2026-10-01', '2026-10-07')],
        booked: [booked('2026-10-03T07:00:00.000Z', 30)],
        fromDate: '2026-10-03',
        toDate: '2026-10-03',
        now: EARLY,
      });

      expect(days[0].isOnLeave).toBe(true);
      expect(days[0].slots).toHaveLength(1);
      expect(days[0].slots[0].localTime).toBe('10:00');
      expect(days[0].slots[0].isTaken).toBe(true);
      expect(days[0].slots[0].isOffSchedule).toBe(true);
    });

    it('covers a whole week of leave inclusively and releases the day after', () => {
      const days = buildAvailability({
        timezone: CAIRO,
        schedules: [makeSchedule({ dayOfWeek: SATURDAY })],
        leaves: [makeLeave('2026-10-03', '2026-10-09')],
        booked: [],
        fromDate: '2026-10-03',
        toDate: '2026-10-10',
        now: EARLY,
      });

      const onLeave = days
        .filter((day) => day.isOnLeave)
        .map((day) => day.date);
      expect(onLeave).toEqual([
        '2026-10-03',
        '2026-10-04',
        '2026-10-05',
        '2026-10-06',
        '2026-10-07',
        '2026-10-08',
        '2026-10-09',
      ]);
      // The next Saturday is bookable again.
      const after = days.find((day) => day.date === '2026-10-10');
      expect(after?.isOnLeave).toBe(false);
      expect(after?.slots).toHaveLength(8);
    });
  });

  describe('the passing of time', () => {
    it('omits slots that have already passed today, taken or not', () => {
      // 08:15Z is 11:15 Cairo, so 09:00-11:00 are gone.
      const [day] = buildAvailability({
        timezone: CAIRO,
        schedules: [makeSchedule()],
        leaves: [],
        booked: [booked('2026-10-03T06:00:00.000Z', 30)], // 09:00, already past
        fromDate: '2026-10-03',
        toDate: '2026-10-03',
        now: new Date('2026-10-03T08:15:00.000Z'),
      });

      expect(day.slots.map((slot) => slot.localTime)).toEqual([
        '11:30',
        '12:00',
        '12:30',
      ]);
    });

    it('treats a slot exactly at now as passed', () => {
      const [day] = buildAvailability({
        timezone: CAIRO,
        schedules: [makeSchedule()],
        leaves: [],
        booked: [],
        fromDate: '2026-10-03',
        toDate: '2026-10-03',
        now: new Date('2026-10-03T06:00:00.000Z'), // exactly 09:00 Cairo
      });

      expect(day.slots[0].localTime).toBe('09:30');
    });
  });

  describe('daylight saving', () => {
    it('keeps the clinic clock steady while the UTC instant shifts', () => {
      const days = buildAvailability({
        timezone: CAIRO,
        schedules: [makeSchedule({ dayOfWeek: SATURDAY })],
        leaves: [],
        booked: [],
        // 2026-10-24 is in DST; 2026-10-31 is after it ends on the 30th.
        fromDate: '2026-10-24',
        toDate: '2026-10-31',
        now: EARLY,
      });

      const inDst = days.find((day) => day.date === '2026-10-24');
      const afterDst = days.find((day) => day.date === '2026-10-31');

      expect(inDst?.slots[0].localTime).toBe('09:00');
      expect(afterDst?.slots[0].localTime).toBe('09:00');
      // Same posted hour, one hour apart in absolute time.
      expect(inDst?.slots[0].at).toEqual(new Date('2026-10-24T06:00:00.000Z'));
      expect(afterDst?.slots[0].at).toEqual(
        new Date('2026-10-31T07:00:00.000Z'),
      );
    });

    it('steps every calendar date across a transition without skipping one', () => {
      const days = buildAvailability({
        timezone: CAIRO,
        schedules: [],
        leaves: [],
        booked: [],
        fromDate: '2026-04-23',
        toDate: '2026-04-26',
        now: EARLY_SPRING,
      });

      expect(days.map((day) => day.date)).toEqual([
        '2026-04-23',
        '2026-04-24',
        '2026-04-25',
        '2026-04-26',
      ]);
    });

    it('skips a slot whose wall-clock time the spring-forward swallowed', () => {
      // Cairo jumps 00:00 -> 01:00 on 2026-04-24, so a 00:00-02:00 window
      // cannot offer midnight or 00:30.
      const days = buildAvailability({
        timezone: CAIRO,
        schedules: [
          makeSchedule({
            dayOfWeek: 5, // Friday
            startTime: '00:00:00',
            endTime: '02:00:00',
            slotMinutes: 30,
          }),
        ],
        leaves: [],
        booked: [],
        fromDate: '2026-04-24',
        toDate: '2026-04-24',
        now: EARLY_SPRING,
      });

      expect(days[0].slots.map((slot) => slot.localTime)).toEqual([
        '01:00',
        '01:30',
      ]);
    });
  });

  describe('other zones', () => {
    it('reads the hours on the zone it is given, not on Cairo', () => {
      const [day] = buildAvailability({
        timezone: 'Europe/London',
        schedules: [makeSchedule()],
        leaves: [],
        booked: [],
        fromDate: '2026-10-03',
        toDate: '2026-10-03',
        now: EARLY,
      });

      expect(day.slots[0].localTime).toBe('09:00');
      // London is +01:00 on that date, Cairo +03:00.
      expect(day.slots[0].at).toEqual(new Date('2026-10-03T08:00:00.000Z'));
    });
  });
});
