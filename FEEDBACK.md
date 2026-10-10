# Team A — Code Review Feedback (Project 2: DOCURA)

**Reviewed:** `health-app/team-a` · 328 TypeScript files, 37 test spec files  
**Standards Applied:** [`clean-code.md`](../../docs/standards/clean-code.md) · [`typescript.md`](../../docs/standards/typescript.md) · [`testing-jest.md`](../../docs/standards/testing-jest.md) · [`restful-api.md`](../../docs/standards/restful-api.md) · [DOCURA Requirements](../../docs/project-2-docura/requirements.md)

---

## 1. Executive Summary

Team A delivered an exceptional, production-grade architectural baseline. The project demonstrates advanced Domain-Driven Design (DDD) with clean vertical slicing, explicit Unit-of-Work boundaries, transactional advisory locking on doctor schedule slots, a PostgreSQL transactional Outbox pattern using `SKIP LOCKED`, RabbitMQ event publishing, and dual-language AI safety guards.

However, three critical business and financial logic deviations were identified: an unconditional refund on appointment cancellation that completely omits the mandatory 24-hour boundary check (BR-20/BR-21), an unrestricted reschedule window (BR-25), and TypeORM decimal column typing traps (`CC-806`).

| Area | Verdict | Details |
| :--- | :---: | :--- |
| **Architecture & Layering** | **Exceptional** | Clean domain/infrastructure separation, UnitOfWork, advisory locks |
| **Event-Driven Architecture** | **Strong** | Outbox pattern with `SKIP LOCKED`, RabbitMQ publisher, processed event deduplication |
| **Type Safety** | **Good** | Strict TypeScript, though decimal columns typed as numbers |
| **Requirements Coverage** | **Good** | Comprehensive implementation, but missed the 24h cancellation/reschedule boundary |
| **Security & Validation** | **Good** | Joi startup validation, Argon2, but missing `forbidNonWhitelisted` and CORS whitelist |

---

## 2. Requirements Coverage Matrix

| Requirement | Status | Evidence | Notes |
| :--- | :---: | :--- | :--- |
| **M1: Auth & Guest Access** | ✅ | `src/auth/auth.service.ts` | Guest token handling, OTP verification, Argon2 hashing |
| **M2: Discovery & Search** | ✅ | `src/doctor/doctor.service.ts`, `src/search/` | Doctor profiles, clinic schedules, geolocation map search |
| **M3: Slot Holds (10m TTL)** | ✅ | `src/appointment/appointment-booking.service.ts:21` | Slot holds with advisory lock, 10-minute TTL, status transitions |
| **M3: Concurrency Protection** | ✅ | `appointment-booking.service.ts:56, 188` | Doctor-level advisory lock + transactional slot verification |
| **M4: Payments & Saved Cards** | ✅ | `src/payment-method/` | Tokenized cards (no CVV/full PAN stored), Stripe webhooks |
| **M5: Cancellation 24h Rule (BR-20, BR-21)** | ❌ | `appointment-history.service.ts:144-158` | **Critical:** Unconditionally issues refunds without checking the 24-hour cutoff |
| **M5: Reschedule 24h Rule (BR-25)** | ⚠️ | `appointment-booking.service.ts:109-113` | Allows rescheduling within 24h (only checks `scheduledAt <= now`) |
| **M6: Engagement & Reminders** | ✅ | `src/common/services/mail/`, `src/favourite/` | Booking confirmation emails, favorites, notifications |
| **M7: Ask Doctor & AI Assistant** | ✅ | `src/ai/ai.service.ts`, `src/ai/ai.safety.ts` | NFKC normalization, Arabic/English emergency detection, prohibited intents |
| **§2.2: Event-Driven Outbox** | ✅ | `src/infrastructure/database/outbox-publisher.service.ts` | Robust outbox polling with `pessimistic_write` and `skip_locked` |
| **Env Validation at Boot** | ✅ | `src/config/env.validation.ts` | Fail-fast Joi validation for all database, auth, and broker variables |
| **HTTP Surface & Prefix** | ⚠️ | `src/main.ts:14-29` | Missing `/api/v1` prefix, wildcard CORS, missing `forbidNonWhitelisted: true` |

---

## 3. Categorized Findings & Actionable Fixes

### Critical Findings

#### **CRIT-1 — `src/appointment/appointment-history.service.ts:144-158` — BR-20, BR-21, CC-805 (critical): Unconditional refund issued on cancellation.**
The system unconditionally issues a refund (`PaymentAttemptStatus.REFUND_PENDING`) for any paid appointment, regardless of when cancellation occurs. Requirements BR-20 and BR-21 explicitly state:
- $\ge 24\text{ hours}$: Cancelled with full refund.
- $< 24\text{ hours}$: Cancelled with **NO refund**.

```ts
// Offending Code:
if (paid?.providerPaymentId) {
  await repos.paymentAttempts.recordOutcome(paid.id, {
    status: PaymentAttemptStatus.REFUND_PENDING,
  });
  await repos.paymentSessions.updateStatus(paid.id, {
    status: PaymentSessionStatus.REFUND_PENDING,
    failureReason: 'APPOINTMENT_CANCELLED_BY_USER',
  });
}
```

**Why it is dangerous:** Patients cancelling minutes before an appointment receive full refunds, exposing the clinic and doctors to financial loss and schedule sabotage.

**Fix:**
```ts
const FREE_CANCELLATION_WINDOW_MS = 24 * 60 * 60 * 1000;
const timeUntilAppointment = appointment.scheduledAt.getTime() - now.getTime();
const isEligibleForRefund = timeUntilAppointment >= FREE_CANCELLATION_WINDOW_MS;

if (paid?.providerPaymentId && isEligibleForRefund) {
  await repos.paymentAttempts.recordOutcome(paid.id, {
    status: PaymentAttemptStatus.REFUND_PENDING,
  });
  await repos.paymentSessions.updateStatus(paid.id, {
    status: PaymentSessionStatus.REFUND_PENDING,
    failureReason: 'APPOINTMENT_CANCELLED_BY_USER',
  });
}

return {
  id: appointment.id,
  status: AppointmentStatus.CANCELLED,
  refundStatus: isEligibleForRefund && paid?.providerPaymentId ? 'PENDING' : null,
};
```

---

#### **CRIT-2 — `src/appointment/appointment-booking.service.ts:109-113` — BR-25, CC-805 (critical): Reschedule bypasses the 24-hour policy.**
Requirement BR-25 stipulates that rescheduling follows the same 24-hour rule as cancellations to prevent patients from rescheduling inside the 24-hour window to evade the non-refundable cancellation fee. The current check only prevents rescheduling appointments in the past:

```ts
// Offending Code:
if (
  source.status !== expectedStatus ||
  (mode === 'reschedule' && source.scheduledAt <= now)
)
  throw new ConflictException('This appointment cannot be replaced');
```

**Fix:**
```ts
const RESCHEDULE_WINDOW_MS = 24 * 60 * 60 * 1000;
const isWithinRescheduleLimit =
  source.scheduledAt.getTime() - now.getTime() >= RESCHEDULE_WINDOW_MS;

if (
  source.status !== expectedStatus ||
  (mode === 'reschedule' && !isWithinRescheduleLimit)
) {
  throw new ConflictException('Rescheduling is only permitted at least 24 hours prior to appointment');
}
```

---

#### **CRIT-3 — `src/doctor/infrastructure/entities/typeorm/doctor-clinic.entity.ts:40-41` — CC-806, TS-104 (critical): TypeORM decimal column typed as TS number without transformer.**
TypeORM outputs SQL `DECIMAL` / `NUMERIC` columns as JavaScript `string` by default to preserve precision. Typing the property as `number` without a value transformer leads to subtle runtime type errors (e.g. string concatenation when calculating totals: `"500.00" + 50 = "500.0050"`).

```ts
// Offending Code:
@Column({ type: 'decimal', precision: 10, scale: 2 })
fee!: number;
```

**Fix:**
Provide an explicit column transformer or type the field accurately:
```ts
export class DecimalColumnTransformer {
  to(data?: number | null): number | null | undefined {
    return data;
  }
  from(data?: string | null): number | null {
    return data ? parseFloat(data) : null;
  }
}

@Column({
  type: 'decimal',
  precision: 10,
  scale: 2,
  transformer: new DecimalColumnTransformer(),
})
fee!: number;
```

---

### Major Findings

#### **MAJ-1 — `src/main.ts:24-29` — CC-206, RS-301 (major): Incomplete global ValidationPipe configuration.**
The global validation pipe specifies `whitelist: true` and `transform: true`, but omits `forbidNonWhitelisted: true`.
**Fix:**
```ts
app.useGlobalPipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }),
);
```

#### **MAJ-2 — `src/main.ts:14` — RS-505 (major): Permissive wildcard CORS.**
`app.enableCors()` with no arguments opens the API to any requesting origin.
**Fix:**
Bind CORS to explicitly configured client domains:
```ts
app.enableCors({
  origin: configService.get<string>('app.corsOrigins')?.split(',') ?? ['http://localhost:3000'],
  credentials: true,
});
```

#### **MAJ-3 — `src/main.ts:10-34` — RS-006, RS-401, RS-407 (major): Missing API versioning and response envelopes.**
The application mounts routes directly at the root `/` rather than `/api/v1`, and lacks a global `HttpExceptionFilter` and `ResponseInterceptor` to guarantee the canonical `{ success, data }` and `{ success, error: { code, message } }` payload format.
**Fix:**
```ts
app.setGlobalPrefix('api/v1');
app.useGlobalFilters(new GlobalExceptionFilter());
app.useGlobalInterceptors(new ResponseTransformInterceptor());
```

---

### Minor Findings

* **MIN-1 — `src/appointment/appointment-booking.service.ts:21-23` — CC-703:** Magic numbers for TTLs (`HOLD_TTL_MS`, `APPOINTMENT_DURATION_MS`) should be consolidated in a domain policy configuration file.

---

## 4. Commendations

1. **Transactional Outbox Implementation:** `OutboxPublisherService` using PostgreSQL advisory locks and TypeORM's `.setLock('pessimistic_write').setOnLocked('skip_locked')` demonstrates exceptional distributed systems design.
2. **AI Safety Architecture:** The multi-pass normalization in `src/ai/ai.safety.ts` handling Arabic diacritics, character normalizations, and dual-language emergency detection is an outstanding real-world implementation.
3. **Fail-Fast Environment Validation:** Full Joi schema validation guarding application startup prevents misconfigured deployments.
