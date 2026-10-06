export const APPOINTMENT_BOOKED_EVENT = 'appointment.booked';
export const PAYMENT_SUCCEEDED_EVENT = 'payment.succeeded';
export const PAYMENT_FAILED_EVENT = 'payment.failed';
export const PRESCRIPTION_ISSUED_EVENT = 'appointment.prescription.issued';

export const APPOINTMENT_CANCELLED_EVENT = 'appointment.cancelled';
export const APPOINTMENT_REMINDER_TRIGGERED_EVENT =
  'appointment.reminder.triggered';
export const FAVOURITE_ADDED_EVENT = 'favourite.added';
export const NOTIFICATION_CREATED_EVENT = 'notification.created';

export const DOCTOR_PROFILE_VIEWED_EVENT = 'doctor.profile.viewed';
export const HOME_OPENED_EVENT = 'home.opened';
export const MAP_REGION_SEARCHED_EVENT = 'map.region.searched';

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
