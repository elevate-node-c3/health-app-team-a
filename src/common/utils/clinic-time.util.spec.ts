import { describe, expect, it } from '@jest/globals';

import {
  addDays,
  assertValidTimezone,
  dateRange,
  dayOfWeekOf,
  instantToLocalTime,
  localDateOf,
  localMonthOf,
  minutesToTime,
  monthBounds,
  shiftMonth,
  timeToMinutes,
  wallClockToInstant,
} from './clinic-time.util';

const CAIRO = 'Africa/Cairo';

describe('clinic-time.util', () => {
  describe('dayOfWeekOf', () => {
    it('maps Luxon weekdays onto the 0-is-Sunday schedule column', () => {
      // doctor_clinic_schedules.dayOfWeek follows JS Date#getDay(), but Luxon
      // counts 1=Monday..7=Sunday. Sunday must wrap to 0, not stay 7.
      expect(dayOfWeekOf('2026-09-27')).toBe(0); // Sunday
      expect(dayOfWeekOf('2026-09-28')).toBe(1); // Monday
      expect(dayOfWeekOf('2026-10-06')).toBe(2); // Tuesday
      expect(dayOfWeekOf('2026-10-03')).toBe(6); // Saturday
    });

    it('is independent of the DST state of the date', () => {
      expect(dayOfWeekOf('2026-04-24')).toBe(5); // Friday, DST begins
      expect(dayOfWeekOf('2026-10-29')).toBe(4); // Thursday, DST ends
    });
  });

  describe('wallClockToInstant', () => {
    it('resolves 09:00 Cairo to 06:00Z while DST is active', () => {
      expect(wallClockToInstant('2026-09-28', '09:00:00', CAIRO)).toEqual(
        new Date('2026-09-28T06:00:00.000Z'),
      );
    });

    it('resolves the same 09:00 Cairo to 07:00Z once DST has ended', () => {
      // Same schedule row, one hour different in UTC — this is the whole
      // reason the conversion is resolved per date rather than per row.
      expect(wallClockToInstant('2026-11-07', '09:00:00', CAIRO)).toEqual(
        new Date('2026-11-07T07:00:00.000Z'),
      );
    });

    it('returns null for a wall time the spring-forward transition skips', () => {
      // Cairo jumps 00:00 -> 01:00 on 2026-04-24, so midnight never happens.
      expect(wallClockToInstant('2026-04-24', '00:00:00', CAIRO)).toBeNull();
      expect(wallClockToInstant('2026-04-24', '00:30:00', CAIRO)).toBeNull();
      // The hour either side of the gap is untouched.
      expect(wallClockToInstant('2026-04-24', '01:00:00', CAIRO)).toEqual(
        new Date('2026-04-23T22:00:00.000Z'),
      );
    });

    it('resolves an ambiguous fall-back hour to its first occurrence', () => {
      // Cairo repeats 23:00 on 2026-10-29 when DST ends. The earlier of the
      // two (+03:00) is chosen.
      expect(wallClockToInstant('2026-10-29', '23:00:00', CAIRO)).toEqual(
        new Date('2026-10-29T20:00:00.000Z'),
      );
    });

    it('accepts both HH:MM and the HH:MM:SS Postgres time columns return', () => {
      expect(wallClockToInstant('2026-09-28', '09:00', CAIRO)).toEqual(
        wallClockToInstant('2026-09-28', '09:00:00', CAIRO),
      );
    });

    it('honours the zone it is given rather than assuming Egypt', () => {
      expect(
        wallClockToInstant('2026-09-28', '09:00:00', 'Europe/London'),
      ).toEqual(new Date('2026-09-28T08:00:00.000Z'));
      expect(wallClockToInstant('2026-09-28', '09:00:00', 'UTC')).toEqual(
        new Date('2026-09-28T09:00:00.000Z'),
      );
    });

    it('rejects a malformed time instead of guessing', () => {
      expect(() => wallClockToInstant('2026-09-28', '9am', CAIRO)).toThrow();
      expect(() =>
        wallClockToInstant('2026-09-28', '25:00:00', CAIRO),
      ).toThrow();
    });
  });

  describe('assertValidTimezone', () => {
    it('throws on an unknown zone rather than degrading to UTC', () => {
      // A typo in clinics.timezone must fail loudly — silently returning UTC
      // would shift every generated slot by hours with no visible error.
      expect(() => assertValidTimezone('Not/AZone')).toThrow(
        'Unknown IANA timezone: Not/AZone',
      );
      expect(() => localDateOf(new Date(), 'Not/AZone')).toThrow();
      expect(() =>
        wallClockToInstant('2026-09-28', '09:00:00', 'Not/AZone'),
      ).toThrow();
    });

    it('accepts real IANA names', () => {
      expect(() => assertValidTimezone(CAIRO)).not.toThrow();
      expect(() => assertValidTimezone('Europe/London')).not.toThrow();
    });
  });

  describe('localDateOf / localMonthOf', () => {
    it('reports the clinic-local date, not the server-local one', () => {
      // 22:30Z on 2026-09-28 is already the 29th in Cairo (+03:00).
      const instant = new Date('2026-09-28T22:30:00.000Z');
      expect(localDateOf(instant, CAIRO)).toBe('2026-09-29');
      expect(localDateOf(instant, 'UTC')).toBe('2026-09-28');
    });

    it('rolls the month over on the clinic clock', () => {
      const instant = new Date('2026-09-30T22:30:00.000Z');
      expect(localMonthOf(instant, CAIRO)).toBe('2026-10');
      expect(localMonthOf(instant, 'UTC')).toBe('2026-09');
    });
  });

  describe('instantToLocalTime', () => {
    it('renders the instant as the clinic clock reads it', () => {
      const instant = new Date('2026-09-28T06:00:00.000Z');
      expect(instantToLocalTime(instant, CAIRO)).toBe('09:00');
      expect(instantToLocalTime(instant, 'Europe/London')).toBe('07:00');
    });

    it('round-trips a generated slot back to its schedule time', () => {
      const at = wallClockToInstant('2026-11-07', '17:20:00', CAIRO);
      expect(at).not.toBeNull();
      expect(instantToLocalTime(at as Date, CAIRO)).toBe('17:20');
    });
  });

  describe('dateRange', () => {
    it('steps by calendar day across a spring-forward transition', () => {
      // A 23-hour day: millisecond arithmetic would skip or repeat a date.
      expect(dateRange('2026-04-23', '2026-04-26')).toEqual([
        '2026-04-23',
        '2026-04-24',
        '2026-04-25',
        '2026-04-26',
      ]);
    });

    it('steps by calendar day across a fall-back transition', () => {
      // A 25-hour day.
      expect(dateRange('2026-10-28', '2026-10-31')).toEqual([
        '2026-10-28',
        '2026-10-29',
        '2026-10-30',
        '2026-10-31',
      ]);
    });

    it('covers a 30-day horizon inclusively and crosses month ends', () => {
      const dates = dateRange('2026-09-28', addDays('2026-09-28', 30));
      expect(dates).toHaveLength(31);
      expect(dates[0]).toBe('2026-09-28');
      expect(dates[3]).toBe('2026-10-01');
      expect(dates.at(-1)).toBe('2026-10-28');
    });

    it('returns a single date when from equals to, and nothing when inverted', () => {
      expect(dateRange('2026-09-28', '2026-09-28')).toEqual(['2026-09-28']);
      expect(dateRange('2026-09-28', '2026-09-27')).toEqual([]);
    });
  });

  describe('addDays', () => {
    it('crosses month and year boundaries', () => {
      expect(addDays('2026-09-28', 30)).toBe('2026-10-28');
      expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
      expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    });
  });

  describe('monthBounds / shiftMonth', () => {
    it('reports the first and last date of a month', () => {
      expect(monthBounds('2026-09')).toEqual({
        first: '2026-09-01',
        last: '2026-09-30',
      });
      expect(monthBounds('2026-02')).toEqual({
        first: '2026-02-01',
        last: '2026-02-28',
      });
      expect(monthBounds('2028-02').last).toBe('2028-02-29'); // leap year
    });

    it('shifts months across year boundaries', () => {
      expect(shiftMonth('2026-12', 1)).toBe('2027-01');
      expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    });

    it('rejects a malformed month', () => {
      expect(() => monthBounds('2026-13')).toThrow();
      expect(() => monthBounds('september')).toThrow();
    });
  });

  describe('timeToMinutes / minutesToTime', () => {
    it('converts a schedule window into steppable minutes', () => {
      expect(timeToMinutes('09:00:00')).toBe(540);
      expect(timeToMinutes('13:00:00')).toBe(780);
      expect(minutesToTime(540)).toBe('09:00');
      expect(minutesToTime(1170)).toBe('19:30');
    });
  });
});
