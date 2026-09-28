# Doctor

The doctor catalog, the doctor profile screen, and real bookable availability.

## Endpoints

Both are `@OptionalAuth()` — guests may browse, exactly as search and home allow.

### `GET /doctors/:id`

Who the doctor is, every clinic they can be booked at, and what each clinic
charges. A signed-in user also gets `isFavourite`.

The `fee` on each clinic is **the fee for that doctor at that clinic**, taken
from the `doctor_clinics` pairing. It is deliberately not the "cheapest fee
across clinics" that list and card views show.

404s when the doctor does not exist **or is not verified** — a patient has no
business learning that an unverified profile exists.

### `GET /doctors/:id/availability?clinicId=<uuid>&month=YYYY-MM`

One month of individual times for one doctor at one clinic. `month` defaults to
the current month **on the clinic's clock**.

```jsonc
{
  "data": [
    {
      "date": "2026-10-03", // the clinic's calendar
      "dayOfWeek": 6, // 0 = Sunday
      "isOnLeave": false,
      "slots": [
        {
          "at": "2026-10-03T06:00:00.000Z",
          "localTime": "09:00",
          "durationMinutes": 30,
          "isTaken": true,
        },
        {
          "at": "2026-10-03T06:15:00.000Z",
          "localTime": "09:15",
          "durationMinutes": 30,
          "isTaken": true,
          "isOffSchedule": true,
        },
        {
          "at": "2026-10-03T06:30:00.000Z",
          "localTime": "09:30",
          "durationMinutes": 30,
          "isTaken": true,
          "isHeld": true,
        },
        {
          "at": "2026-10-03T07:00:00.000Z",
          "localTime": "10:00",
          "durationMinutes": 30,
          "isTaken": false,
        },
      ],
    },
  ],
  "meta": {
    "timezone": "Africa/Cairo",
    "generatedAt": "2026-09-28T06:00:00.000Z",
    "staleAfterSeconds": 60,
    "isReservation": false,
    "booking": {
      "horizonDays": 30,
      "earliestDate": "2026-09-28",
      "latestDate": "2026-10-28",
      "timezone": "Africa/Cairo",
    },
    "canGoPrevious": false,
    "canGoNext": true,
  },
}
```

## The rules

**This response is a snapshot, not a reservation.** It reports what was free at
`generatedAt` and holds nothing — someone else may take any of these times a
second later. A client that has had the screen open longer than
`staleAfterSeconds` must refetch. What actually prevents a double booking is the
partial unique index `UQ_appointments_doctor_instant` on
`(doctorId, scheduledAt) WHERE status = 'SCHEDULED'`.

**A booked time is returned and marked taken, never omitted.** Omitting it would
make the day look emptier than it is.

**A time someone is paying for right now is taken too.** Two hold mechanisms
exist — `booking_holds` behind `POST /appointments/holds` and `slot_holds`
behind `POST /slot-holds` — and both make an instant unbookable for the minutes
their hold lives. A slot blocked only by a live hold comes back `isTaken` with
`isHeld: true`, so the client can say "being booked" rather than "unavailable".
Unlike a booking, an off-grid hold is **not** surfaced as a slot of its own: it
lapses in minutes and would leave a phantom time in a response the client may
still be showing. See [hold.repository.ts](domain/repositories/hold.repository.ts).

**Taken is doctor-wide, not clinic-wide.** A doctor cannot be in two places at
once, so a booking or hold at one clinic blocks that instant at every other. The
availability read is therefore scoped to the doctor, matching both
`UQ_appointments_doctor_instant` and `AppointmentBookingService`. A clinic-scoped
read would offer times the booking path always rejects.

**Times are UTC instants plus the clinic's own wall clock.** `at` is the
absolute instant; `localTime` is what the clinic itself calls that time. Show
`localTime` — the patient physically travels there, so the clinic's number is
the one that matters.

**Only bookable pairings expose availability.** An inactive pairing, an inactive
clinic, or an unverified doctor yields a 404 and no times at all.

**The booking horizon is one number.** `BOOKING_HORIZON_DAYS` in
[availability.constants.ts](availability.constants.ts) bounds slot generation
_and_ `canGoPrevious` / `canGoNext`, so a patient can never page to a month they
are not allowed to book in. Past times are outside the window and are omitted.

**Slot length belongs to the hours it subdivides.** `slotMinutes` sits on
`doctor_clinic_schedules`, so "Saturdays 09:00–13:00, 30 minutes per patient"
and "Tuesdays 17:00–20:00, 20 minutes" can coexist at one clinic. A trailing
remainder shorter than one slot is dropped.

**Leave is whole days and personal to the doctor**, so it applies at every
clinic. A leave day generates no new slots, but existing bookings on it are
still shown.

**Nothing does its own timezone arithmetic.**
[clinic-time.util.ts](../common/utils/clinic-time.util.ts) is the only place
zone math happens, and every function takes the zone explicitly. Egypt observes
DST again (late April to late October), so `09:00` is `06:00Z` in summer and
`07:00Z` in winter — the conversion is resolved per date. Dates are stepped by
calendar day, never by a fixed 24 hours, because a DST day is 23 or 25 hours
long. A wall time the spring-forward swallowed is skipped; an ambiguous
fall-back hour resolves to its first occurrence. An unrecognised zone name
throws rather than degrading to UTC.

## When the schedule changes under existing bookings

A booking records its own `scheduledAt` and `durationMinutes`. It deliberately
holds **no reference to `doctor_clinic_schedules`**: a schedule row is a mutable
rule (hours get edited, slot length changes, rows get deleted by cascade) while
an appointment is an immutable fact. A `scheduleId` would let a schedule edit
rewrite or delete booked history.

So when the hours or the slot length change, old bookings no longer land on the
grid. Such a booking is surfaced as its own slot flagged `isOffSchedule`, **and**
every generated slot whose range it overlaps is marked `isTaken`. A 30-minute
booking therefore blocks two 20-minute slots after a length change: no
double-booking, and no invented free time.

## Layout

```text
doctor/
  availability.constants.ts   horizon, fallback duration, snapshot TTL
  availability.util.ts        pure slot generation — all the rules, no I/O
  doctor.controller.ts        the two routes
  doctor.service.ts           use cases; clamps the window, assembles responses
  doctor.events.ts            doctor.profile.viewed + analytics listener
  doctor.types.ts             response shapes
  dto/                        query validation
  domain/                     models and repository ports
  infrastructure/             TypeORM entities, mappers, adapters
```

`availability.util.ts` is pure and clock-injected, so every rule above is
testable without a database — see [availability.util.spec.ts](availability.util.spec.ts).

## Verifying against real data

```bash
npm run migration:run
npm run seed:availability   # prints the ids and dates to try
```

The seed creates two active clinics at different fees, an inactive pairing, both
schedule shapes, a week of leave, and on-grid, off-grid and on-leave bookings.
