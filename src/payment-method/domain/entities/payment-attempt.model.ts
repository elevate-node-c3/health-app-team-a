import { PaymentAttemptStatus } from 'src/payment-method/domain/enums/payment-attempt-status.enum';

/**
 * One attempt to charge a card for one hold.
 *
 * Identified to the client by `idempotencyKey`, which is unique per user: a
 * retry with the same key must return the first attempt's outcome rather than
 * charge again. `id` doubles as the key handed to the provider, so asking the
 * provider about a charge is always possible without storing anything extra.
 *
 * `amount` stays a string for the same reason as `BookingHold.frozenAmount` —
 * it is money from a `numeric` column and is quoted to the provider verbatim.
 */
export class PaymentAttempt {
  constructor(
    public readonly id: string,
    public readonly userId: string,
    public readonly holdId: string,
    public readonly paymentMethodId: string,
    public readonly providerRef: string,
    public readonly idempotencyKey: string,
    public readonly amount: string,
    public readonly currency: string,
    public status: PaymentAttemptStatus,
    public providerPaymentId: string | null,
    public appointmentId: string | null,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
  ) {}

  isSucceeded(): boolean {
    return this.status === PaymentAttemptStatus.SUCCEEDED;
  }

  isFailed(): boolean {
    return this.status === PaymentAttemptStatus.FAILED;
  }

  isProcessing(): boolean {
    return this.status === PaymentAttemptStatus.PROCESSING;
  }

  isAwaitingRefund(): boolean {
    return this.status === PaymentAttemptStatus.REFUND_PENDING;
  }

  /** Settled either way, so no further provider call should be made. */
  isSettled(): boolean {
    return this.isSucceeded() || this.isFailed();
  }

  /**
   * Whether this attempt was made for the same request as the one being
   * retried. A key reused for a different card or hold is a client bug, and
   * serving the first result would hide it.
   */
  matchesRequest(paymentMethodId: string, holdId: string): boolean {
    return this.paymentMethodId === paymentMethodId && this.holdId === holdId;
  }
}
