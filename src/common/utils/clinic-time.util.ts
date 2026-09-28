import { DateTime, IANAZone } from 'luxon';

/**
 * Fallback zone for callers that have no single clinic in context — the search
 * Today/Tomorrow filter spans many clinics at once, so it has no per-clinic
 * zone to use. Anything that knows its clinic must pass `clinic.timezone`.
 */
export const DEFAULT_TIMEZONE = 'Africa/Cairo';

/** A calendar date with no zone and no time, as 'YYYY-MM-DD'. */
const ISO_DATE_FORMAT = 'yyyy-MM-dd';
/** A month with no zone, as 'YYYY-MM'. */
const ISO_MONTH_FORMAT = 'yyyy-MM';

/**
 * Rejects a zone name Luxon does not recognise instead of letting it degrade
 * silently to UTC — a typo in `clinics.timezone` would otherwise shift every
 * generated slot by hours with no visible error.
 */
export function assertValidTimezone(zone: string): void {
  if (!IANAZone.isValidZone(zone)) {
    throw new Error(`Unknown IANA timezone: ${zone}`);
  }
}

/** The calendar date in `zone` at the given instant, as 'YYYY-MM-DD'. */
export function localDateOf(instant: Date, zone: string): string {
  assertValidTimezone(zone);
  return DateTime.fromJSDate(instant, { zone }).toFormat(ISO_DATE_FORMAT);
}

/**
 * 0 = Sunday … 6 = Saturday, matching `doctor_clinic_schedules.dayOfWeek` and
 * JS `Date#getDay()`. Luxon counts 1 = Monday … 7 = Sunday, so Sunday (7) has
 * to wrap back to 0.
 */
export function dayOfWeekOf(isoDate: string): number {
  return parseDate(isoDate).weekday % 7;
}

/**
 * Every inclusive calendar date from `fromIso` to `toIso`. Steps by calendar
 * day rather than by a fixed 24h of milliseconds: a DST day is 23 or 25 hours
 * long, so millisecond arithmetic would skip or repeat a date. Returns empty
 * when the range is inverted.
 */
export function dateRange(fromIso: string, toIso: string): string[] {
  const last = parseDate(toIso);
  const dates: string[] = [];

  for (
    let cursor = parseDate(fromIso);
    cursor <= last;
    cursor = cursor.plus({ days: 1 })
  ) {
    dates.push(cursor.toFormat(ISO_DATE_FORMAT));
  }

  return dates;
}

/** Calendar-day arithmetic on a 'YYYY-MM-DD' date. */
export function addDays(isoDate: string, days: number): string {
  return parseDate(isoDate).plus({ days }).toFormat(ISO_DATE_FORMAT);
}

/** First and last calendar date of a 'YYYY-MM' month. */
export function monthBounds(month: string): { first: string; last: string } {
  const start = parseMonth(month);
  return {
    first: start.toFormat(ISO_DATE_FORMAT),
    last: start.endOf('month').toFormat(ISO_DATE_FORMAT),
  };
}

/** Shifts a 'YYYY-MM' month by whole months. */
export function shiftMonth(month: string, delta: number): string {
  return parseMonth(month).plus({ months: delta }).toFormat(ISO_MONTH_FORMAT);
}

/** The 'YYYY-MM' month the given instant falls in, in `zone`. */
export function localMonthOf(instant: Date, zone: string): string {
  assertValidTimezone(zone);
  return DateTime.fromJSDate(instant, { zone }).toFormat(ISO_MONTH_FORMAT);
}

/**
 * A wall-clock time as `zone` reads it, converted to the absolute instant it
 * refers to. Returns null when that wall time does not exist — the hour a
 * spring-forward DST transition skips. Ambiguous times, the hour a fall-back
 * transition repeats, resolve to the first (pre-transition) occurrence.
 *
 * @param isoDate 'YYYY-MM-DD'
 * @param time    'HH:MM' or 'HH:MM:SS' (Postgres `time` columns arrive as the latter)
 */
export function wallClockToInstant(
  isoDate: string,
  time: string,
  zone: string,
): Date | null {
  assertValidTimezone(zone);

  const { hour, minute, second } = parseTime(time);
  const wall = DateTime.fromObject(
    { ...splitDate(isoDate), hour, minute, second },
    { zone },
  );

  // Luxon shifts a nonexistent wall time forward rather than failing, so the
  // only way to detect the DST gap is to read the clock back and compare.
  if (
    !wall.isValid ||
    wall.hour !== hour ||
    wall.minute !== minute ||
    wall.second !== second
  ) {
    return null;
  }

  return wall.toJSDate();
}

/** An instant rendered as 'HH:mm' on the clinic's own clock. */
export function instantToLocalTime(instant: Date, zone: string): string {
  assertValidTimezone(zone);
  return DateTime.fromJSDate(instant, { zone }).toFormat('HH:mm');
}

/** Minutes since midnight, for stepping a schedule row's window. */
export function timeToMinutes(time: string): number {
  const { hour, minute } = parseTime(time);
  return hour * 60 + minute;
}

/** Minutes since midnight back to 'HH:MM'. */
export function minutesToTime(minutes: number): string {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${pad(hour)}:${pad(minute)}`;
}

function parseDate(isoDate: string): DateTime {
  // Parsed in UTC deliberately: these are zoneless calendar dates, and holding
  // them in a fixed zone keeps weekday and day-stepping independent of both the
  // server's zone and any clinic's.
  const parsed = DateTime.fromFormat(isoDate, ISO_DATE_FORMAT, { zone: 'utc' });
  if (!parsed.isValid) throw new Error(`Invalid date: ${isoDate}`);
  return parsed;
}

function parseMonth(month: string): DateTime {
  const parsed = DateTime.fromFormat(month, ISO_MONTH_FORMAT, { zone: 'utc' });
  if (!parsed.isValid) throw new Error(`Invalid month: ${month}`);
  return parsed;
}

function splitDate(isoDate: string): {
  year: number;
  month: number;
  day: number;
} {
  const parsed = parseDate(isoDate);
  return { year: parsed.year, month: parsed.month, day: parsed.day };
}

function parseTime(time: string): {
  hour: number;
  minute: number;
  second: number;
} {
  const match = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(time);
  if (!match) throw new Error(`Invalid time: ${time}`);

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = Number(match[3] ?? '0');

  if (hour > 23 || minute > 59 || second > 59) {
    throw new Error(`Invalid time: ${time}`);
  }

  return { hour, minute, second };
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}
