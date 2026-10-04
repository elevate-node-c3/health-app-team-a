import type { AppointmentRepository } from 'src/appointment/domain/repositories/appointment.repository';
import type { BookablePairingRepository } from 'src/appointment/domain/repositories/bookable-pairing.repository';
import type { BookingHoldRepository } from 'src/appointment/domain/repositories/booking-hold.repository';
import type { PrescriptionRepository } from 'src/appointment/domain/repositories/prescription.repository';
import type { PaymentAttemptRepository } from 'src/payment-method/domain/repositories/payment-attempt.repository';
import type { PaymentSessionRepository } from 'src/payment-method/domain/repositories/payment-session.repository';

/**
 * Everything a booking use case may touch inside one transaction.
 *
 * `lockDoctor` is here rather than on a repository because it is not about any
 * one table: it serializes every booking attempt for a doctor so the slot
 * checks that follow cannot interleave with another request's. Exposing it on
 * the bundle keeps the advisory lock an infrastructure detail while still
 * letting the use case decide *when* to take it — handing the caller an
 * `EntityManager` to lock with would leak TypeORM instead.
 */
export interface AppointmentTransactionRepositories {
  appointments: AppointmentRepository;
  holds: BookingHoldRepository;
  prescriptions: PrescriptionRepository;
  pairings: BookablePairingRepository;

  /**
   * The payment rows a cancellation has to touch: cancelling a paid
   * appointment must move its attempt to REFUND_PENDING in the *same*
   * transaction, or the appointment would be cancelled with the money
   * silently kept.
   *
   * They are ports, so this is the appointment module depending on payment's
   * abstractions, not on its module or on TypeORM.
   */
  paymentAttempts: PaymentAttemptRepository;
  paymentSessions: PaymentSessionRepository;

  /**
   * Blocks other bookings for this doctor until the transaction ends.
   *
   * Needed because the conflict checks read rows that may not exist yet: two
   * requests for the same free instant have nothing to row-lock until one of
   * them inserts, so without this both would pass their checks.
   */
  lockDoctor(doctorId: string): Promise<void>;

  /** Records a domain event in the same transaction as the rows causing it. */
  appendEvent(
    eventName: string,
    payload: Record<string, unknown>,
  ): Promise<void>;
}

export interface AppointmentUnitOfWork {
  execute<T>(
    work: (repositories: AppointmentTransactionRepositories) => Promise<T>,
  ): Promise<T>;
}

export const APPOINTMENT_UNIT_OF_WORK = Symbol('APPOINTMENT_UNIT_OF_WORK');
