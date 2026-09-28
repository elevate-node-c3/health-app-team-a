/**
 * How far ahead a patient may book, in whole days from today. The single
 * source of truth: slot generation and the calendar's month arrows both derive
 * their bounds from this, so the window a patient can browse and the window
 * they can book can never disagree.
 */
export const BOOKING_HORIZON_DAYS = 30;

/**
 * Assumed length of a booked appointment when neither the appointment itself
 * nor the day's schedule says how long it runs. Only reached by rows written
 * before `appointments.durationMinutes` existed.
 */
export const DEFAULT_BOOKED_DURATION_MINUTES = 30;

/**
 * How long a client may trust an availability snapshot before refetching. The
 * response reports what was free when it was built and reserves nothing, so a
 * screen left open must come back for fresh times rather than assume.
 */
export const AVAILABILITY_STALE_AFTER_SECONDS = 60;
