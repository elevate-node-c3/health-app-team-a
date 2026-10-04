import type { PaymentAttempt } from 'src/payment-method/domain/entities/payment-attempt.model';
import type { PaymentAttemptStatus } from 'src/payment-method/domain/enums/payment-attempt-status.enum';

export interface CreatePaymentAttemptInput {
  userId: string;
  holdId: string;
  paymentMethodId: string;
  providerRef: string;
  idempotencyKey: string;
  amount: string;
  currency: string;
}

/** Fields a settlement may write; omitted keys are left as stored. */
export interface PaymentAttemptOutcome {
  status: PaymentAttemptStatus;
  providerPaymentId?: string | null;
  appointmentId?: string | null;
}

export interface PaymentAttemptRepository {
  /** Opens an attempt in PROCESSING. Throws on a duplicate idempotency key. */
  create(input: CreatePaymentAttemptInput): Promise<PaymentAttempt>;

  findByIdempotencyKey(
    userId: string,
    idempotencyKey: string,
  ): Promise<PaymentAttempt | null>;

  /**
   * Unlocked read by id, for the provider webhook — which identifies an
   * attempt by the id we handed the provider as its idempotency key, and has
   * no user context to scope by.
   */
  findById(id: string): Promise<PaymentAttempt | null>;

  /** Row-locked read; only meaningful inside a unit of work. */
  findByIdForUpdate(id: string): Promise<PaymentAttempt | null>;

  /** Row-locked read of the succeeded attempt that paid for an appointment. */
  findSucceededForAppointmentForUpdate(
    appointmentId: string,
    userId: string,
  ): Promise<PaymentAttempt | null>;

  /** Row-locked read by idempotency key, for the confirm path. */
  findByIdempotencyKeyForUpdate(
    userId: string,
    idempotencyKey: string,
  ): Promise<PaymentAttempt | null>;

  recordOutcome(id: string, outcome: PaymentAttemptOutcome): Promise<void>;

  /**
   * Moves an attempt to REFUND_PENDING, but only from a state where that is
   * still correct — a concurrently succeeded attempt must not be dragged
   * backwards. Returns whether the row actually changed.
   */
  markRefundPendingFrom(
    id: string,
    allowedFrom: PaymentAttemptStatus[],
    providerPaymentId: string,
  ): Promise<boolean>;

  /**
   * The oldest unfinished attempts, for the reconciliation sweep. Oldest first
   * so a repeatedly failing attempt cannot starve the queue behind it.
   */
  findUnfinished(
    statuses: PaymentAttemptStatus[],
    limit: number,
  ): Promise<PaymentAttempt[]>;
}

export const PAYMENT_ATTEMPT_REPOSITORY = Symbol('PAYMENT_ATTEMPT_REPOSITORY');
