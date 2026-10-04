import type { AppointmentTransactionRepositories } from 'src/appointment/domain/repositories/unit-of-work';
import type { PaymentAttemptRepository } from 'src/payment-method/domain/repositories/payment-attempt.repository';
import type { PaymentSessionRepository } from 'src/payment-method/domain/repositories/payment-session.repository';

/**
 * Everything a payment use case may touch inside one transaction.
 *
 * It carries the **appointment** bundle as well as payment's own repositories,
 * because a charge is not settled until the booking exists: the attempt, the
 * session, the hold and the appointment all commit together or none of them
 * do. That is the module declaring a dependency it genuinely has, which is
 * what the per-module unit-of-work design is for — and it is a dependency on
 * appointment's *ports*, not on its module or on TypeORM.
 */
export interface PaymentTransactionRepositories {
  attempts: PaymentAttemptRepository;
  sessions: PaymentSessionRepository;

  /** Passed straight to `AppointmentBookingService`'s in-transaction methods. */
  appointment: AppointmentTransactionRepositories;

  /**
   * Serializes concurrent retries of one idempotency key, so the
   * read-then-insert in `confirmPayment` cannot double-charge.
   */
  lockIdempotencyKey(userId: string, idempotencyKey: string): Promise<void>;

  /** Records a domain event in the same transaction as the rows causing it. */
  appendEvent(
    eventName: string,
    payload: Record<string, unknown>,
  ): Promise<void>;
}

export interface PaymentUnitOfWork {
  execute<T>(
    work: (repositories: PaymentTransactionRepositories) => Promise<T>,
  ): Promise<T>;
}

export const PAYMENT_UNIT_OF_WORK = Symbol('PAYMENT_UNIT_OF_WORK');
