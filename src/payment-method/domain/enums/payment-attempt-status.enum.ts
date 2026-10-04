/**
 * The life of one charge attempt.
 *
 * PROCESSING is the only state the app may retry from: the provider has been
 * asked but has not answered, so reconciliation keeps looking. REFUND_PENDING
 * means money was taken for a booking that cannot be honoured and is owed
 * back. SUCCEEDED and FAILED are terminal.
 *
 * Lives in the domain rather than beside the ORM entity so that application
 * code comparing a status does not have to import from `infrastructure/`.
 */
export enum PaymentAttemptStatus {
  PROCESSING = 'PROCESSING',
  REFUND_PENDING = 'REFUND_PENDING',
  SUCCEEDED = 'SUCCEEDED',
  FAILED = 'FAILED',
}
