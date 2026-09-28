# Health App API

Health App is a NestJS API for account access, doctor discovery, articles, favourites, appointment history, prescription downloads, appointment holds, and payment-backed booking. PostgreSQL stores application data, Redis backs cache/session-related services, and authenticated requests use HTTP-only cookies.

## Requirements

- Node.js 20 or newer and npm
- PostgreSQL
- Redis
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
- `common`: shared auth guards, mail, OTP, token, and security services.

Controllers validate DTOs through the global `ValidationPipe` (`whitelist` and `transform` enabled). Authenticated endpoints use `accessToken` cookies; `/auth/refresh` uses the refresh cookie. Search and Home allow guests and authenticated users. Postman retains cookies automatically when its cookie jar is enabled.

## HTTP API

All routes below are relative to `{{base_url}}` (default `http://localhost:3000`). “Auth” means a valid access-token cookie is required. “Optional” allows a guest request, but rejects an invalid supplied token.

| Method   | Route                                       | Access             | Purpose                                                               |
| -------- | ------------------------------------------- | ------------------ | --------------------------------------------------------------------- |
| `GET`    | `/`                                         | Public             | Basic API health response                                             |
| `GET`    | `/home`                                     | Optional           | Home content and, when signed in, personal appointment/favourite data |
| `POST`   | `/auth/signup`                              | Public             | Create an account and send verification email                         |
| `POST`   | `/auth/verify-email`                        | Public             | Verify email and establish access/refresh cookies                     |
| `POST`   | `/auth/resend-verification`                 | Public             | Resend the email-verification code                                    |
| `POST`   | `/auth/login`                               | Public             | Authenticate and establish access/refresh cookies                     |
| `POST`   | `/auth/refresh`                             | Refresh cookie     | Rotate the access and refresh cookies                                 |
| `POST`   | `/auth/logout`                              | Auth               | Revoke this session or all sessions (`everywhere`)                    |
| `POST`   | `/auth/forget-password`                     | Public             | Begin password recovery                                               |
| `POST`   | `/auth/forget-password/resend-otp`          | Public             | Resend a password-recovery code                                       |
| `POST`   | `/auth/verify-otp`                          | Public             | Verify a password-recovery code                                       |
| `POST`   | `/auth/reset-password`                      | Public             | Set a new password after recovery verification                        |
| `GET`    | `/auth/users?page=1&limit=10`               | Auth               | List users with pagination                                            |
| `GET`    | `/auth/me`                                  | Auth               | Return the current signed-in user                                     |
| `GET`    | `/search/suggestions?query=Den`             | Optional           | Search doctor and specialty suggestions                               |
| `GET`    | `/search?query=Cardiology`                  | Optional           | Search/filter doctors and specialties                                 |
| `GET`    | `/search/map?neLat&neLng&swLat&swLng`       | Optional           | Search the map's visible bounds, with distances                       |
| `GET`    | `/search/history`                           | Optional           | Read guest-device or signed-in search history                         |
| `DELETE` | `/search/history`                           | Optional           | Clear the current search owner's history                              |
| `GET`    | `/doctors/:id`                              | Optional           | Read a doctor profile (`isFavourite` when signed in)                  |
| `GET`    | `/doctors/:id/availability?clinicId&month`  | Optional           | Read a doctor's monthly availability at a clinic                      |
| `GET`    | `/articles?page=1&limit=10`                 | Public             | List published articles                                               |
| `GET`    | `/articles/:id`                             | Public             | Read a published article                                              |
| `POST`   | `/favourites/:doctorId`                     | Auth               | Add a doctor to the current user's favourites                         |
| `DELETE` | `/favourites/:doctorId`                     | Auth               | Remove a doctor from favourites                                       |
| `POST`   | `/appointments/holds`                       | Auth               | Hold a selected doctor/clinic appointment time                        |
| `GET`    | `/appointments?tab=all&limit=20`             | Auth               | Page the current patient's booking history                             |
| `POST`   | `/appointments/:id/cancel`                  | Auth               | Cancel an owned, future scheduled appointment                         |
| `POST`   | `/appointments/:id/reschedule/holds`        | Auth               | Hold a replacement time for an upcoming appointment                  |
| `POST`   | `/appointments/:id/rebook/holds`            | Auth               | Start a new booking from a cancelled appointment                      |
| `GET`    | `/appointments/:id/prescription`            | Auth               | Get an expiring private download link, or `available: false`          |
| `GET`    | `/appointments/:id/prescription/download`   | Auth               | Download the prescription using its signed short-lived link           |
| `GET`    | `/payment-methods`                          | Auth               | List the current user's saved cards                                   |
| `POST`   | `/payment-methods`                          | Auth               | Tokenize a card and optionally save it                                |
| `PATCH`  | `/payment-methods/:id`                      | Auth               | Edit saved card holder/expiry metadata                                |
| `DELETE` | `/payment-methods/:id`                      | Auth               | Remove a saved payment method                                         |
| `POST`   | `/payment-methods/:id/confirm`              | Auth               | Charge against an owned, live hold and confirm booking                |
| `GET`    | `/payment-methods/attempts/:idempotencyKey` | Auth               | Read the outcome of the user's payment attempt                        |
| `POST`   | `/payment-provider/webhook`                 | Provider signature | Accept a verified provider result                                     |

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

The response includes the hold `id`, `frozenAmount`, `expiresAt`, and status. Holds last ten minutes. A new hold is refused if the doctor/clinic pairing is inactive, the time is not in the future, or another hold/appointment overlaps the 30-minute slot.

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
- Webhooks require the `provider-signature` header. The provider adapter verifies the message and the service asks the provider for its current charge state, reducing the impact of duplicate or out-of-order webhook deliveries.
- The outbox publisher dispatches durable events asynchronously; notification delivery is not part of the booking transaction or synchronous confirmation response.

### Current integration boundaries

The configured adapter is `FakePaymentProviderAdapter`: it does not move real money. Its fake webhook signature is for local testing only. Replace it with a real provider adapter and provider-managed signature verification before deployment. The repository currently has no SMS/push adapters, reminder scheduler, or notification-center consumer; the outbox publishes the booking/payment events for those consumers, but it does not itself deliver SMS, email, push, or reminders. The hold endpoint also does not yet validate the chosen timestamp against a clinic schedule; clients should only submit times offered by the availability flow.

## Postman

Import [Health App API.postman_collection.json](Health%20App%20API.postman_collection.json). Set `base_url`, `doctor_id`, `clinic_id`, `scheduled_at`, `appointment_id`, `payment_method_id`, and `idempotency_key` collection/environment variables. The collection includes each booking-history tab, cancel, reschedule/re-book hold, and prescription-link/download requests. Run the booking hold request first and copy its returned ID into `hold_id`; then run Confirm Payment. Keep the same idempotency key when retrying or checking payment status. Enable Postman's cookie jar and log in before running authenticated requests. Do not put real card details or credentials in a shared collection.

The separate [health-app.postman_collection.json](health-app.postman_collection.json) retains the focused auth/search requests.

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
