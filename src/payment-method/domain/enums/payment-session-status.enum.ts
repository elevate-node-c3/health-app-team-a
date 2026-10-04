/**
 * The audit trail of a payment, one row per attempt.
 *
 * Tracks the same journey as `PaymentAttemptStatus` but keeps CREATED and
 * REFUNDED as distinct states, so a reader can tell "never charged" from
 * "charged and given back" — which the attempt's FAILED alone cannot express.
 *
 * Lives in the domain for the same reason as `PaymentAttemptStatus`.
 */
export enum PaymentSessionStatus {
  CREATED = 'CREATED',
  PROCESSING = 'PROCESSING',
  SUCCEEDED = 'SUCCEEDED',
  FAILED = 'FAILED',
  REFUND_PENDING = 'REFUND_PENDING',
  REFUNDED = 'REFUNDED',
}
