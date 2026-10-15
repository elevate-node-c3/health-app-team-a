# Team A — Code Review Feedback (Project 2: DOCURA)

**Reviewed:** `health-app/team-a` · 328 TypeScript files, 37 test spec files  
**Standards Applied:** [`clean-code.md`](../../docs/standards/clean-code.md) · [`typescript.md`](../../docs/standards/typescript.md) · [`testing-jest.md`](../../docs/standards/testing-jest.md) · [`restful-api.md`](../../docs/standards/restful-api.md) · [DOCURA Requirements](../../docs/project-2-docura/requirements.md) · [Bootcamp Evaluation Rubric](https://developing-rumba-be2.notion.site/Elevate-Nodejs-Bootcamp-321a865666e2806f934cc3123376296c)

---

## 1. Executive Summary

Team A delivered an exceptional, production-grade architectural baseline. The project demonstrates advanced Domain-Driven Design (DDD) with clean vertical slicing, explicit Unit-of-Work boundaries, transactional advisory locking on doctor schedule slots, a PostgreSQL transactional Outbox pattern using `SKIP LOCKED`, RabbitMQ event publishing, and dual-language AI safety guards.

However, several critical and major violations against the standards were identified during our line-by-line inspection: an unconditional refund on appointment cancellation that completely omits the mandatory 24-hour boundary check (BR-20/BR-21), an unrestricted reschedule window (BR-25), TypeORM decimal column typing traps (`CC-806`), swallowing email dispatch errors with `console.error` while returning false success messages (`CC-401`), and missing security headers/version prefixes.

| Area | Verdict | Details |
| :--- | :---: | :--- |
| **Architecture & Layering** | **Exceptional** | Clean domain/infrastructure separation, UnitOfWork, advisory locks |
| **Event-Driven Architecture** | **Strong** | Outbox pattern with `SKIP LOCKED`, RabbitMQ publisher, processed event deduplication |
| **Type Safety** | **Good** | Strict TypeScript, though decimal columns typed as numbers |
| **Requirements Coverage** | **Good** | Comprehensive implementation, but missed the 24h cancellation/reschedule boundary |
| **Security & Validation** | **Good** | Joi startup validation, Argon2, but missing `forbidNonWhitelisted` and CORS whitelist |
| **Total Deliverables Score** | **31 / 35** | **Grade: B+ (89.5%)** |

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

### 3.1. Critical Findings

#### **CRIT-1 — `src/appointment/appointment-history.service.ts:144-158` — BR-20, BR-21, CC-504 (critical): Unconditional refund issued on cancellation.**
The system unconditionally issues a refund (`PaymentAttemptStatus.REFUND_PENDING`) for any paid appointment, regardless of when cancellation occurs. Requirements BR-20 and BR-21 explicitly state:
- $\ge 24\text{ hours}$: Cancelled with full refund.
- $< 24\text{ hours}$: Cancelled with **NO refund**.

```ts
// Offending Code (src/appointment/appointment-history.service.ts:144-158):
const paid = await repos.paymentAttempts.findSucceededForAppointmentForUpdate(
  appointmentId,
  userId,
);

if (paid?.providerPaymentId) {
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
  refundStatus: paid?.providerPaymentId ? 'PENDING' : null,
};
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

#### **CRIT-2 — `src/appointment/appointment-booking.service.ts:109-113` — BR-25, CC-504 (critical): Reschedule bypasses the 24-hour policy.**
Requirement BR-25 stipulates that rescheduling follows the same 24-hour rule as cancellations to prevent patients from rescheduling inside the 24-hour window to evade the non-refundable cancellation fee. The current check only prevents rescheduling appointments in the past:

```ts
// Offending Code (src/appointment/appointment-booking.service.ts:109-113):
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

#### **CRIT-3 — `src/doctor/infrastructure/entities/typeorm/doctor-clinic.entity.ts:40-41` & `src/slot-hold/infrastructure/entities/typeorm/slot-hold.entity.ts:51` — CC-806, TS-104 (critical): TypeORM decimal column typed as TS number without transformer.**
TypeORM outputs SQL `DECIMAL` / `NUMERIC` columns as JavaScript `string` by default to preserve precision. Typing the property as `number` without a value transformer leads to subtle runtime type errors (e.g. string concatenation when calculating totals: `"500.00" + 50 = "500.0050"`).

```ts
// Offending Code (doctor-clinic.entity.ts:40-41):
@Column({ type: 'decimal', precision: 10, scale: 2 })
fee!: number;
```

**Fix:**
Provide an explicit column transformer:
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

### 3.2. Major Findings

#### **MAJ-1 — `src/auth/auth.service.ts:143-147` & `228-232` — CC-401 (major): Swallowing mail dispatch errors in try/catch while asserting false success.**
```ts
// Offending Code (src/auth/auth.service.ts:228-235):
try {
  await this.mailService.sendOtp(user.email, OTP);
} catch (e) {
  console.error('Failed to send OTP email', e);
}

return {
  message: 'OTP sent successfully',
};
```
**Why it is dangerous:** When SMTP or provider fails, the error is swallowed and logged with `console.error`. The method returns `{ message: 'OTP sent successfully' }`, falsely reassuring the user even though the OTP was never delivered.
**Fix:**
Propagate an actionable exception or queue background retries:
```ts
try {
  await this.mailService.sendOtp(user.email, OTP);
} catch (error) {
  this.logger.error(`Failed to send OTP to ${user.email}`, error);
  throw new BadGatewayException('Failed to deliver OTP email. Please try again shortly.');
}
```

---

#### **MAJ-2 — `src/main.ts:24-29` — CC-206, RS-301 (major): Incomplete global ValidationPipe configuration.**
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

---

#### **MAJ-3 — `src/main.ts:14` — RS-404 (major): Permissive wildcard CORS.**
`app.enableCors()` with no arguments opens the API to any requesting origin.
**Fix:**
Bind CORS to explicitly configured client domains:
```ts
app.enableCors({
  origin: configService.get<string>('app.corsOrigins')?.split(',') ?? ['http://localhost:3000'],
  credentials: true,
});
```

---

#### **MAJ-4 — `src/main.ts:10-34` — RS-006, RS-001, RS-002 (major): Missing API versioning, global exception filter, and response envelopes.**
The application mounts routes directly at the root `/` rather than `/api/v1`, and lacks a global `HttpExceptionFilter` and `ResponseInterceptor` to guarantee the canonical `{ success: true, data }` and `{ success: false, error: { code, message } }` format.
**Fix:**
```ts
app.setGlobalPrefix('api/v1');
app.useGlobalFilters(new GlobalExceptionFilter());
app.useGlobalInterceptors(new ResponseTransformInterceptor());
```

---

### 3.3. Minor Findings

* **MIN-1 — `src/appointment/appointment-booking.service.ts:21-23` — CC-703:** Magic numbers for TTLs (`HOLD_TTL_MS`, `APPOINTMENT_DURATION_MS`) should be consolidated in a domain policy configuration file.
* **MIN-2 — `src/doctor/infrastructure/entities/typeorm/clinic.entity.ts:27,30` — CC-806, TS-104:** Geolocation coordinates (`latitude`, `longitude`) are stored as decimal without transformers.
* **MIN-3 — `src/slot-hold/infrastructure/repositories/typeorm-slot-hold.repository.ts:163` — CC-401:** Raw catch block without structured NestJS Logger logging.

---

## 4. Commendations

1. **Transactional Outbox Implementation:** `OutboxPublisherService` using PostgreSQL advisory locks and TypeORM's `.setLock('pessimistic_write').setOnLocked('skip_locked')` demonstrates exceptional distributed systems design.
2. **AI Safety Architecture:** The multi-pass normalization in `src/ai/ai.safety.ts` handling Arabic diacritics, character normalizations, and dual-language emergency detection is an outstanding real-world implementation.
3. **Fail-Fast Environment Validation:** Full Joi schema validation guarding application startup prevents misconfigured deployments.
