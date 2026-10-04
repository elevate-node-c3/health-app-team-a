import type { PaymentSessionStatus } from 'src/payment-method/domain/enums/payment-session-status.enum';

export interface NewPaymentSession {
  userId: string;
  paymentAttemptId: string;
  holdId: string;
  doctorId: string;
  clinicId: string;
  scheduledAt: Date;
  amount: string;
  currency: string;
}

/** Fields a session update may set; omitted keys are left untouched. */
export interface PaymentSessionStatusChange {
  status: PaymentSessionStatus;
  stripePaymentIntentId?: string | null;
  appointmentId?: string | null;
  failureReason?: string | null;
}

/**
 * The payment audit trail. Write-only from the application's point of view:
 * nothing reads a session back, it exists so a human can reconstruct what
 * happened to a payment after the fact.
 */
export interface PaymentSessionRepository {
  /**
   * Opens a session in CREATED. The provider identifiers and the appointment
   * are unknown until the charge resolves, so they start null and are filled
   * in by `updateStatus`.
   */
  insert(session: NewPaymentSession): Promise<void>;

  /**
   * Advances the session belonging to one attempt. Passing an explicit `null`
   * clears a column; leaving a key off preserves it — the refund path relies
   * on that to update the status without disturbing the provider id recorded
   * at charge time.
   */
  updateStatus(
    paymentAttemptId: string,
    change: PaymentSessionStatusChange,
  ): Promise<void>;
}

export const PAYMENT_SESSION_REPOSITORY = Symbol('PAYMENT_SESSION_REPOSITORY');
