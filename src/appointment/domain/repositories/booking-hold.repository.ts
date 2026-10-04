import type { BookingHold } from 'src/appointment/domain/entities/booking-hold.model';
import type { BookingHoldStatus } from 'src/appointment/domain/enums/booking-hold-status.enum';

export interface CreateBookingHoldInput {
  userId: string;
  doctorId: string;
  clinicId: string;
  scheduledAt: Date;
  frozenAmount: string;
  expiresAt: Date;
  reschedulesAppointmentId: string | null;
}

export interface BookingHoldRepository {
  create(input: CreateBookingHoldInput): Promise<BookingHold>;

  /**
   * Reads a hold and blocks any concurrent reader of the same row until the
   * transaction ends.
   *
   * The lock is the point: claiming, booking and releasing all read the status
   * and then write it, so without it two payments could both see a payable
   * hold. Only callable inside a unit of work — outside one the lock would be
   * released immediately and buy nothing.
   */
  findByIdForUpdate(id: string): Promise<BookingHold | null>;

  /** As `findByIdForUpdate`, additionally scoped to its owner. */
  findByIdForUserForUpdate(
    id: string,
    userId: string,
  ): Promise<BookingHold | null>;

  updateStatus(id: string, status: BookingHoldStatus): Promise<void>;

  /**
   * Whether this doctor has a live hold starting inside the half-open window
   * `(after, before)`.
   *
   * The window is passed as plain instants rather than a slot length, so the
   * rule about how long an appointment blocks stays in the application and
   * only the comparison lives in infrastructure.
   *
   * "Live" is two things OR'd: a PAYMENT_PENDING hold never expires, because
   * the money is already in flight, while a plain HELD hold only blocks until
   * `expiresAt` passes.
   */
  existsLiveInWindow(
    doctorId: string,
    after: Date,
    before: Date,
    now: Date,
  ): Promise<boolean>;
}

export const BOOKING_HOLD_REPOSITORY = Symbol('BOOKING_HOLD_REPOSITORY');
