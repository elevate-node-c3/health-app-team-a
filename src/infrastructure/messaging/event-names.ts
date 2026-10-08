/**
 * Every application event name, in one place — the single naming authority.
 *
 * Convention: `<domain>.<entity?>.<past-tense-verb>`, lowercase, dot-separated
 * segments, kebab-case within a segment. A routing key is always one of these
 * constants, never a literal string, so a typo in an event name fails at
 * compile time instead of silently binding nothing.
 *
 * Payload *shapes* are not centralized here and stay in each module's own
 * `*.events.ts` — moving them here would make this infrastructure module
 * depend on six feature modules, inverting the dependency direction this
 * package elsewhere exists to enforce.
 *
 * The four outbox-backed names below are also persisted verbatim in
 * `outbox_events.eventName` rows; renaming any of them would orphan
 * unpublished in-flight events, so they are not "fixed" to the convention
 * retroactively even though they already happen to match it.
 */

// Outbox-backed, reliable tier (see RELIABLE_CONSUMERS).
export const APPOINTMENT_BOOKED_EVENT = 'appointment.booked';
export const PAYMENT_SUCCEEDED_EVENT = 'payment.succeeded';
export const PAYMENT_FAILED_EVENT = 'payment.failed';
export const PRESCRIPTION_ISSUED_EVENT = 'appointment.prescription.issued';

// Fire-and-forget, analytics tier (see ANALYTICS_CONSUMERS).
export const DOCTOR_PROFILE_VIEWED_EVENT = 'doctor.profile.viewed';
export const HOME_OPENED_EVENT = 'home.opened';
export const MAP_REGION_SEARCHED_EVENT = 'map.region.searched';

// Fire-and-forget, no consumer today. Still published, so a future consumer
// can bind a queue without a publisher-side change.
export const USER_REGISTERED_EVENT = 'user.registered';
export const USER_VERIFIED_EVENT = 'user.verified';
export const USER_VERIFICATION_CODE_ISSUED_EVENT =
  'user.verification-code.issued';
export const USER_PASSWORD_RESET_CODE_ISSUED_EVENT =
  'user.password-reset-code.issued';
export const PAYMENT_METHOD_ADDED_EVENT = 'payment-method.added';
export const PAYMENT_METHOD_REMOVED_EVENT = 'payment-method.removed';
export const SLOT_HOLD_HELD_EVENT = 'slot-hold.held';
export const SLOT_HOLD_EXPIRED_EVENT = 'slot-hold.expired';
export const MEDICAL_QUESTION_ASKED_EVENT = 'medical-question.asked';
export const MEDICAL_QUESTION_ANSWERED_EVENT = 'medical-question.answered';
export const QUESTION_ANSWER_WINDOW_BREACHED_EVENT =
  'medical-question.answer-window.breached';

// Published externally by the admin/doctor system onto EVENTS_EXCHANGE; this
// app only ever consumes it (see RELIABLE_CONSUMERS). Never emitted from
// inside this codebase.
export const MEDICAL_QUESTION_ANSWER_SUBMITTED_EVENT =
  'medical-question.answer.submitted';
export const AI_CONVERSATION_STARTED_EVENT = 'ai.conversation.started';
export const AI_MESSAGE_ANSWERED_EVENT = 'ai.message.answered';
export const AI_EMERGENCY_DETECTED_EVENT = 'ai.emergency.detected';
