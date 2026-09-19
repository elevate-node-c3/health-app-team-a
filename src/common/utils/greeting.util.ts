export type TimeOfDay = 'morning' | 'afternoon' | 'evening';

/**
 * The hour (0-23) of `at` in the given IANA time zone, using native `Intl` so
 * no date library is needed. Defaults to Africa/Cairo per BR-02.
 */
export function hourInTimezone(at: Date, timezone: string): number {
  const formatted = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    hour12: false,
  }).format(at);

  // `hour12: false` can render midnight as "24"; normalize back to 0.
  const hour = Number.parseInt(formatted, 10);
  return hour === 24 ? 0 : hour;
}

export function timeOfDay(at: Date, timezone: string): TimeOfDay {
  const hour = hourInTimezone(at, timezone);
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}

/**
 * Time-of-day greeting text (BR-02). A `name` produces a personalized greeting
 * for signed-in users; omit it for the generic guest greeting (BR-03).
 */
export function buildGreetingText(at: Date, timezone: string): string {
  const map: Record<TimeOfDay, string> = {
    morning: 'Good morning',
    afternoon: 'Good afternoon',
    evening: 'Good evening',
  };
  return map[timeOfDay(at, timezone)];
}
