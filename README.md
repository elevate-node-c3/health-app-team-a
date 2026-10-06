# Health App API

Health App is a NestJS API for account access, doctor discovery, articles, favourites, appointment history, prescription downloads, appointment holds, and payment-backed booking. PostgreSQL stores application data, Redis backs cache/session-related services, and authenticated requests use HTTP-only cookies.

## Requirements

- Node.js 20 or newer and npm
- PostgreSQL
- Redis
- RabbitMQ (`docker compose up rabbitmq` starts one locally)
- SMTP server for email verification and password recovery

## Setup

Install dependencies and create a local environment file:

```bash
npm ci
cp .env.example .env
```

Set the database, Redis, JWT, and SMTP values in `.env`. Database and Redis connection settings are required. Use long, private JWT secrets outside local development. SMTP defaults in the example are suitable only when a local mail catcher is running.

Start the API in watch mode:

```bash
npm run start:dev
```

The default port is `3000`; `PORT` overrides it. The root health check is `GET /`.

## Running with Docker

`docker compose up --build` runs the whole stack — Postgres (with PostGIS), Redis, RabbitMQ, a
one-shot `migrate` service, and the app — with no local Node, Postgres, or RabbitMQ install needed.

```bash
cp .env.example .env   # fill in real JWT/Stripe secrets
docker compose up --build
```

- `DB_HOST`, `REDIS_HOST`, and `RABBITMQ_URL` are overridden in `docker-compose.yml` to the Compose
  service names (`postgres`, `redis`, `rabbitmq`); every other value comes from `.env`. The `.env`
  file itself is never built into the image or committed — only `.env.example` is tracked.
- `migrate` runs `npm run migration:run:prod` against the compiled `dist/` output and exits; `app`
  waits for it to succeed before starting, so a fresh `docker compose up` always starts against an
  up-to-date schema.
- Postgres data persists in the `postgres-data` named volume across `docker compose down` (without
  `-v`); `docker compose down -v` drops it for a clean-slate run. Redis holds only short-TTL OTPs
  and a regenerable cache, so it is not persisted.
- The app image is a multi-stage build (`Dockerfile`): a `deps`/`build` stage compiles TypeScript
  with the full dev toolchain, and the `runtime` stage installs only production dependencies and
  copies in `dist/` — no source `.ts` files or dev tooling (`jest`, `eslint`, `ts-node`, `nest`) ship
  in the final image.
- The `seed:*` scripts run through `ts-node` against `src/`, which the production image does not
  contain. Run them on the host instead, pointed at the containerized Postgres (`DB_HOST=localhost`
  in `.env`, since `DB_PORT` is published).

## Database

TypeORM uses migrations and does not synchronize the schema automatically. Review and apply migrations after configuring PostgreSQL:

```bash
npm run migration:show
npm run migration:run
```

The booking/payment-flow migration creates `booking_holds`, `payment_attempts`, and `outbox_events`. The appointment-history migration adds appointment display snapshots, replacement-hold tracking, and private prescription metadata. It depends on the existing users, doctors, clinics, payment methods, and appointments tables being migrated first. Use `npm run migration:revert` only when intentionally reverting the latest migration.

## Architecture

- `auth`: signup, email verification, login, sessions, password recovery, and user profile.
- `doctor` and `search`: doctor catalog access and searchable suggestions/history.
- `home`, `article`, and `favourite`: home aggregation, published articles, and a user's saved doctors.
- `appointment`: owner-scoped booking history and actions, immutable card snapshots, booking-hold creation, and prescription metadata/download access.
- `payment-method`: card tokenization, saved-card management, charge orchestration, webhook handling, and payment reconciliation.
- `infrastructure/database`: TypeORM setup, migrations, and the transactional outbox publisher.
- `infrastructure/messaging`: the one module allowed to know RabbitMQ exists — exchange/queue topology, the event publisher port, and consumer idempotency.
- `common`: shared auth guards, mail, OTP, token, and security services.

Controllers validate DTOs through the global `ValidationPipe` (`whitelist` and `transform` enabled). Authenticated endpoints use `accessToken` cookies; `/auth/refresh` uses the refresh cookie. Postman retains cookies automatically when its cookie jar is enabled.

### Business events over RabbitMQ

The four events already written to the transactional outbox — `appointment.booked`, `payment.succeeded`, `payment.failed`, `appointment.prescription.issued` — are published to RabbitMQ rather than delivered in-process. Everything else (three log-only analytics listeners, several publishes with no consumer, and search history's own local emitter) stays on `EventEmitter2`; brokering a log line or an unread event would add infrastructure with no payoff.

- **Topology**, centralized in [`MessagingModule`](src/infrastructure/messaging/messaging.module.ts): one topic exchange `health.events`, routing key = event name. A consumer's queue is named `<consumer>.<event>`, so two consumers of the same event never share a queue or a failure.
- **Delivery**: [`OutboxPublisherService`](src/infrastructure/database/outbox-publisher.service.ts) publishes a claimed row (with publisher confirms) and only then marks it `publishedAt` — publish-then-mark, at-least-once. A crash between the two republishes the row on the next poll, so **every consumer must be idempotent**.
- **Idempotency**: a consumer claims `(eventId, handler)` in the `processed_events` table before acting; a duplicate claim means "already handled, ack and skip."
- **Retry and DLQ**: a handler that throws nacks without requeue, which routes to a per-consumer retry queue (30s TTL) and back to the main queue, up to 3 attempts; the 4th dead-letters into that consumer's own DLQ queue for manual replay.
- A new consumer adds one entry to `RELIABLE_CONSUMERS` in [`rabbitmq.constants.ts`](src/infrastructure/messaging/rabbitmq.constants.ts) and a handler using `EVENT_PUBLISHER`/`PROCESSED_EVENT_REPOSITORY`/`@RabbitSubscribe` — never its own exchange or retry policy.

Run `docker compose up rabbitmq` for a local broker (management UI at `localhost:15672`, guest/guest).

### Database access

Pick the lowest-numbered option the query actually fits. All of rules 2–4 belong in
`infrastructure/`; rule 5 says why.

1. **Repository API — the default.** `find`, `findOne`, `findOneBy`, `existsBy`, `save`, `update`,
   `delete`, `upsert`, `count`, with operators (`In`, `MoreThan`, `Between`, `And`), `relations`,
   `select`, and `order`/`take`/`skip`. [typeorm-appointment.repository.ts](src/appointment/infrastructure/repositories/typeorm-appointment.repository.ts)
   and [typeorm-favourite.repository.ts](src/favourite/infrastructure/repositories/typeorm-favourite.repository.ts)
   are the reference. Inside a transaction, reach the same API through `manager.getRepository(X)` —
   still rule 1.
2. **QueryBuilder — only where rule 1 cannot express the query.** The cases that qualify:
   - aggregates and `GROUP BY` — `MIN(fee)` in [typeorm-doctor.repository.ts](src/doctor/infrastructure/repositories/typeorm-doctor.repository.ts);
   - a condition on the **join** rather than the `WHERE`, which find-options would silently turn
     from a left join into an inner one (same file, `findProfile`);
   - `UPDATE … RETURNING *` for compare-and-set, which `repo.update()` cannot return —
     [typeorm-slot-hold.repository.ts](src/slot-hold/infrastructure/repositories/typeorm-slot-hold.repository.ts);
   - keyset pagination, whose predicate is a compound `OR` over two columns — `findHistoryPage`;
   - filters composed from optional request fields — [typeorm-search.repository.ts](src/search/infrastructure/repositories/typeorm-search.repository.ts).
3. **Raw SQL — only where TypeORM offers no surface at all.** Today that is exactly one thing:
   advisory locks, in [advisory-lock.ts](src/infrastructure/database/advisory-lock.ts). Always
   parameterized; never interpolate user input into SQL.
4. **PostgreSQL-specific features — freely, where the database is the right place to do the work.**
   PostGIS (`ST_Intersects`, `ST_Distance`) for map search, `FOR UPDATE SKIP LOCKED` in the hold
   reaper and the outbox publisher, `AT TIME ZONE` in [offered-slot.query.ts](src/doctor/infrastructure/offered-slot.query.ts),
   `ON CONFLICT` via `upsert()`.
5. **Boundaries.** Rules 2–4 live in `infrastructure/`, as either an injectable repository behind a
   domain port or a `fn(manager, …)` query function when the caller owns the transaction
   ([offered-slot.query.ts](src/doctor/infrastructure/offered-slot.query.ts) is the pattern).
   **No service builds a QueryBuilder or writes SQL.** A service may own a transaction and call
   `manager.getRepository(X)` for rule-1 work. The rule is enforceable:

   ```bash
   grep -rn "createQueryBuilder\|\.query(" --include=*.service.ts src/ | grep -v infrastructure/
   ```

   That must return nothing.

### Known duplication: two hold mechanisms

The app has **two parallel implementations of the same concept**. `booking_holds` backs
`POST /appointments/holds`; `slot_holds` backs `POST /slot-holds`. Separate tables, services, DTOs
and repositories, doing the same job — hold a doctor's time while the patient pays.

Both are routed and both work, so availability has to read both:
[hold.repository.ts](src/doctor/domain/repositories/hold.repository.ts) unions the two tables,
which is why a time held through either endpoint correctly disappears from
`GET /doctors/:id/availability`. Its doc comment is the authoritative explanation.

This is the largest duplication in the codebase and should be consolidated. It was left in place
deliberately: `slot_holds` is the better-developed of the two (conditional `UPDATE … RETURNING`
compare-and-set, a `FOR UPDATE SKIP LOCKED` reaper, hold extension), so it should win — but
unifying means a data migration, re-testing both money paths, and retiring one endpoint, none of
which is a behaviour-preserving refactor. Until then, **a change to hold semantics must be made in
both places**, and `hold.repository.ts` must keep reading both.

### User modes

Every request is in exactly one of three modes, resolved by `accessLevelOf` in [src/common/utils/access-level.util.ts](src/common/utils/access-level.util.ts) from `users.isVerified`. The JWT's `level` claim is not authoritative and must not be read — a token minted before verification would pin a stale mode for the life of the session.

| Mode           | Meaning                                                                 |
| -------------- | ----------------------------------------------------------------------- |
| **Guest**      | No session on the request.                                              |
| **Unverified** | Has an account and profile information, has not completed verification. |
| **Verified**   | Has completed verification.                                             |

**For authorization, guest and unverified are equals.** Any action a guest cannot perform is equally unavailable to an unverified user; both are refused by `@Verified()`, the guest with `401` and the unverified user with `403 Please verify your account to perform this action`. What the unverified mode buys is a **more personalized journey**, not more permissions: Home returns their name, favourite flags and personal sections exactly as it does for a verified user, because personalization keys off the presence of a user and never off `isVerified`.

The one exception is **account self-service** (`@AccountAccess()` — `/auth/me`, `/auth/logout`, `/auth/users`), which admits any authenticated user. Without it an unverified user could not reach their own account to verify it, and the mode would be a dead end.

Routes declare their requirement with one decorator, and no service performs its own mode check:

| Decorator          | Admits                                                                          |
| ------------------ | ------------------------------------------------------------------------------- |
| _(none)_           | Everyone; fully public, no guard runs                                           |
| `@OptionalAuth()`  | Guest, unverified, verified — a guest-safe read, enriched when a session exists |
| `@AccountAccess()` | Unverified, verified                                                            |
| `@Verified()`      | Verified only                                                                   |

## HTTP API

All routes below are relative to `{{base_url}}` (default `http://localhost:3000`). The Access column uses the user modes above: “Verified” requires a verified account, “Account” any signed-in account, “Optional” allows a guest request but rejects an invalid supplied token, and “Public” needs no session.

| Method   | Route                                       | Access             | Purpose                                                               |
| -------- | ------------------------------------------- | ------------------ | --------------------------------------------------------------------- |
| `GET`    | `/`                                         | Public             | Basic API health response                                             |
| `GET`    | `/home`                                     | Optional           | Home content and, when signed in, personal appointment/favourite data |
| `POST`   | `/auth/signup`                              | Public             | Create an account and send verification email                         |
| `POST`   | `/auth/verify-email`                        | Public             | Verify email and establish access/refresh cookies                     |
| `POST`   | `/auth/resend-verification`                 | Public             | Resend the email-verification code                                    |
| `POST`   | `/auth/login`                               | Public             | Authenticate and establish access/refresh cookies                     |
| `POST`   | `/auth/refresh`                             | Refresh cookie     | Rotate the access and refresh cookies                                 |
| `POST`   | `/auth/logout`                              | Account            | Revoke this session or all sessions (`everywhere`)                    |
| `POST`   | `/auth/forget-password`                     | Public             | Begin password recovery                                               |
| `POST`   | `/auth/forget-password/resend-otp`          | Public             | Resend a password-recovery code                                       |
| `POST`   | `/auth/verify-otp`                          | Public             | Verify a password-recovery code                                       |
| `POST`   | `/auth/reset-password`                      | Public             | Set a new password after recovery verification                        |
| `GET`    | `/auth/users?page=1&limit=10`               | Account            | List users with pagination                                            |
| `GET`    | `/auth/me`                                  | Account            | Return the current signed-in user                                     |
| `GET`    | `/search/suggestions?query=Den`             | Optional           | Search doctor and specialty suggestions                               |
| `GET`    | `/search?query=Cardiology`                  | Optional           | Search/filter doctors and specialties                                 |
| `GET`    | `/search/map?neLat&neLng&swLat&swLng`       | Optional           | Search the map's visible bounds, with distances                       |
| `GET`    | `/search/history`                           | Optional           | Read guest-device or signed-in search history                         |
| `DELETE` | `/search/history`                           | Optional           | Clear the current search owner's history                              |
| `GET`    | `/doctors/:id`                              | Optional           | Read a doctor profile (`isFavourite` when signed in)                  |
| `GET`    | `/doctors/:id/availability?clinicId&month`  | Optional           | Read a doctor's monthly availability at a clinic                      |
| `GET`    | `/articles?page=1&limit=10`                 | Public             | List published articles                                               |
| `GET`    | `/articles/:id`                             | Public             | Read a published article                                              |
| `POST`   | `/favourites/:doctorId`                     | Verified           | Add a doctor to the current user's favourites                         |
| `DELETE` | `/favourites/:doctorId`                     | Verified           | Remove a doctor from favourites                                       |
| `POST`   | `/slot-holds`                               | Verified           | Hold a doctor/clinic time while the patient pays                      |
| `GET`    | `/slot-holds/:id`                           | Verified           | Read one of the caller's own holds                                    |
| `PATCH`  | `/slot-holds/:id/extend`                    | Verified           | Extend a live hold the caller owns                                    |
| `DELETE` | `/slot-holds/:id`                           | Verified           | Release a hold the caller owns                                        |
| `POST`   | `/appointments/holds`                       | Verified           | Hold a selected doctor/clinic appointment time                        |
| `GET`    | `/appointments?tab=all&limit=20`            | Verified           | Page the current patient's booking history                            |
| `POST`   | `/appointments/:id/cancel`                  | Verified           | Cancel an owned, future scheduled appointment                         |
| `POST`   | `/appointments/:id/reschedule/holds`        | Verified           | Hold a replacement time for an upcoming appointment                   |
| `POST`   | `/appointments/:id/rebook/holds`            | Verified           | Start a new booking from a cancelled appointment                      |
| `GET`    | `/appointments/:id/prescription`            | Verified           | Get an expiring private download link, or `available: false`          |
| `GET`    | `/appointments/:id/prescription/download`   | Verified           | Download the prescription using its signed short-lived link           |
| `GET`    | `/payment-methods`                          | Verified           | List the current user's saved cards                                   |
| `POST`   | `/payment-methods`                          | Verified           | Tokenize a card and optionally save it                                |
| `PATCH`  | `/payment-methods/:id`                      | Verified           | Edit saved card holder/expiry metadata                                |
| `DELETE` | `/payment-methods/:id`                      | Verified           | Remove a saved payment method                                         |
| `POST`   | `/payment-methods/:id/confirm`              | Verified           | Charge against an owned, live hold and confirm booking                |
| `GET`    | `/payment-methods/attempts/:idempotencyKey` | Verified           | Read the outcome of the user's payment attempt                        |
| `POST`   | `/payment-provider/webhook`                 | Provider signature | Accept a verified provider result                                     |
| `POST`   | `/medical-questions`                        | Verified           | Ask a free, anonymous human-doctor question                           |
| `GET`    | `/medical-questions?page=1&limit=10`        | Verified           | Page the caller's own questions and answers                           |
| `GET`    | `/medical-questions/:id`                    | Verified           | Read one of the caller's own questions                                |
| `DELETE` | `/medical-questions/:id`                    | Verified           | Delete an owned question and its answer                               |

Search accepts `query`, `genders`, `availability`, `places`, `titles`, `governorate`, `city`, `specialty`, `minPrice`, `maxPrice`, `rating`, `page`, `limit`, `sortBy`, and `sortOrder`. Array filters may be repeated as query parameters. Matching behavior and search history are documented in [src/search/README.md](src/search/README.md).

Signup requires `name`, `email`, `phone`, `gender`, `password`, and `confirmPassword`. Passwords must be at least eight characters and include a letter, number, and symbol. Email verification and recovery DTOs require `email` and a four-character `otp` where applicable. Logout accepts `{ "everywhere": true | false }`.

## My Bookings

`GET /appointments` accepts `tab=all|upcoming|completed|cancelled`, `limit` (1-50, default 20), and an opaque `cursor`. It always scopes results to the authenticated patient and orders by appointment time and ID newest first. The response is `{ "items": [], "nextCursor": null, "hasMore": false }` when the selected tab has no results. Pass `nextCursor` unchanged to fetch the next page. Appointments still marked `SCHEDULED` whose scheduled time has passed are presented as `COMPLETED` and appear in the Completed tab, so they leave Upcoming when the tab is refreshed.

Each item includes the doctor photo/name/specialty, clinic name/area, date/time, status, prescription availability, and status-derived actions. Upcoming items return `CANCEL` and `RESCHEDULE`; completed items always return `DOWNLOAD_PRESCRIPTION`, with `enabled: false` when no prescription file is available; cancelled items return `RE_BOOK`. The server does not return other actions for those statuses. Doctor, specialty, and clinic display snapshots are captured when booking so deleted catalog records do not erase existing history.

Cancel only applies to a future scheduled appointment. Reschedule creates a hold for the same doctor and clinic; the original stays scheduled until the replacement payment succeeds, then it is cancelled in the same transaction that confirms the new booking. Re-book accepts a cancelled appointment, creates a separate booking hold with the original doctor and clinic preselected, and never changes the cancelled record. Both flows use the normal payment confirmation endpoint with the new hold. If the doctor or clinic is no longer active, the replacement hold is rejected and the original history record remains unchanged.

Prescription files are stored outside the public web root. Before calling the internal `AppointmentHistoryService.issuePrescription(appointmentId, storageKey)` operation, the private file must be present under `PRESCRIPTION_STORAGE_DIR` (default: `private-prescriptions`). The storage key is metadata only and is never returned to the patient. Issuance is limited to completed appointments and writes `appointment.prescription.issued` to the transactional outbox. The link endpoint returns `available: false` when there is no record or its file is missing; otherwise it returns a five-minute signed URL. The download endpoint also requires the patient's authenticated cookie and binds the signature to that patient's ID, so a forwarded URL cannot be used by another account. A missing file returns `404` until the private file is restored.

## Book and Pay

### 1. Create a hold

The client sends the selected doctor, clinic, and ISO-8601 appointment time. The server resolves the active doctor-clinic fee and stores it as the frozen amount; the client does not provide a charge amount.

```http
POST /appointments/holds
Cookie: accessToken=<session cookie>
Content-Type: application/json
```

```json
{
  "doctorId": "<doctor-uuid>",
  "clinicId": "<clinic-uuid>",
  "scheduledAt": "2026-10-15T15:00:00+03:00"
}
```

The response includes the hold `id`, `frozenAmount`, `expiresAt`, and status. Holds last ten minutes. A new hold is refused if the caller is not verified, the doctor/clinic pairing is inactive, the time is not in the future, or another hold/appointment overlaps the 30-minute slot.

### 2. Confirm payment

Send the saved payment-method UUID in the URL and the hold UUID in the body. The `Idempotency-Key` is required and must be reused for every retry of the same payment attempt. Use a new key for a new payment attempt.

```http
POST /payment-methods/<payment-method-uuid>/confirm
Cookie: accessToken=<session cookie>
Idempotency-Key: <stable-unique-key>
Content-Type: application/json
```

```json
{
  "holdId": "<hold-uuid>"
}
```

On success, the response is the immediate booking confirmation and includes the appointment ID, scheduled time, doctor/clinic, arrival time (15 minutes early), and confirmation text. A decline returns a payment-failed result with `CHECK_CARD_DETAILS`. If the provider is unreachable or the outcome is not yet known, the API returns `processing`; do not create a new attempt or key. Read status with `GET /payment-methods/attempts/<same-idempotency-key>` or retry the confirm request with the same key.

### Payment safety and recovery

- Hold ownership, expiry, and current doctor/clinic availability are checked before charging.
- The amount is copied from the hold and persisted on the attempt before the provider call.
- The provider call is made outside the database transaction. A Postgres advisory lock serializes requests using the same user's idempotency key; a unique database index backs this guarantee.
- A declined result releases the pending hold and creates no appointment.
- A successful charge and appointment are finalized in a short transaction with both payment events and `appointment.booked` written to the outbox.
- If booking finalization fails after a successful charge, the service attempts an idempotent refund. Unconfirmed provider outcomes/refunds remain pending and are retried by the background reconciler every 30 seconds.
- Webhooks require the `stripe-signature` header. The provider adapter verifies the message against the Stripe webhook secret and the service asks the provider for its current charge state, reducing the impact of duplicate or out-of-order webhook deliveries.
- The outbox publisher dispatches durable events to RabbitMQ asynchronously; notification delivery is not part of the booking transaction or synchronous confirmation response.

### Current integration boundaries

The configured adapter is `StripePaymentProviderAdapter` ([src/payment-method/payment-method.module.ts](src/payment-method/payment-method.module.ts)): it tokenizes cards and charges through Stripe, and webhook signatures are verified with `stripe.webhooks.constructEvent` against `STRIPE_WEBHOOK_SECRET`. `FakePaymentProviderAdapter` still exists in the codebase and is used by tests, but it is not the adapter wired at runtime. The repository currently has no SMS/push adapters, reminder scheduler, or notification-center consumer; the outbox publishes the booking/payment events for those consumers, but it does not itself deliver SMS, email, push, or reminders. The hold endpoint also does not yet validate the chosen timestamp against a clinic schedule; clients should only submit times offered by the availability flow.

## Ask a Doctor

A signed-in patient can ask a free question to a human doctor without exposing their identity to the doctor — the platform still retains the identity needed to deliver the response. `POST /medical-questions` accepts `concern` (max 50 characters), `symptoms` (max 250 characters), `gender`, `age` (a plausible integer), and `isEmergency`. Every answered question's response includes a fixed medical disclaimer.

An emergency question (`isEmergency: true`) skips the queue entirely: the response comes back already `ANSWERED` with an immediate canned urgent-care message, in the same request. A non-emergency question starts `PENDING`; a doctor's answer arrives asynchronously from an external admin system over RabbitMQ (`medical-question.answer.submitted`), which this service consumes to mark the question `ANSWERED` and publish `medical-question.answered`. Two background sweeps run every 5 minutes: a question unanswered 20 hours after being asked is marked `ESCALATED` (publishes `medical-question.answer-window.breached` with `stage: "escalated"`); one still unanswered at 24 hours is marked notified (same event, `stage: "patient_notified"`) so the client can offer booking an appointment instead. `GET /medical-questions` and `GET /medical-questions/:id` are scoped to the caller; `DELETE /medical-questions/:id` soft-deletes a question and its answer.

## Postman

Import [Health App API.postman_collection.json](Health%20App%20API.postman_collection.json). Set `base_url`, `doctor_id`, `clinic_id`, `scheduled_at`, `appointment_id`, `payment_method_id`, `idempotency_key`, and `stripe_webhook_secret` collection variables. The collection includes each booking-history tab, cancel, reschedule/re-book hold, prescription-link/download, and Ask-a-Doctor requests. Run the booking hold request first and copy its returned ID into `hold_id`; then run Confirm Payment. Keep the same idempotency key when retrying or checking payment status. The webhook request's pre-request script signs its body with `stripe_webhook_secret` (set it to your local `.env`'s `STRIPE_WEBHOOK_SECRET`) so it passes real Stripe signature verification; it also needs `payment_attempt_id` set to the payment attempt's own database UUID (not `idempotency_key`, which is the client-facing header) — no API response exposes that UUID, so look it up in server logs or the database when testing this request manually. Enable Postman's cookie jar and log in before running authenticated requests. Do not put real card details, credentials, or your real webhook secret in a shared collection.

## Commands

```bash
npm run start:dev                 # Development server
npm run build                     # Production compilation
npm test -- --runInBand           # Unit tests
npm run test:e2e                  # E2E tests
npm run check                     # Prettier check
npm run migration:show            # Show database migration state
npm run migration:run             # Apply pending migrations
```

## Validation

The payment/booking implementation was validated with `npm run build`, changed-file ESLint, and the full Jest suite. The latest recorded run passed 10 suites and 63 tests. Database migrations and live payment-provider/SMS/push delivery require their configured services and were not exercised by unit tests.
