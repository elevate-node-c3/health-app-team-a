import { BookingHoldStatus } from 'src/appointment/domain/enums/booking-hold-status.enum';

/**
 * A claim on a doctor's time while the patient pays, behind
 * `POST /appointments/holds`.
 *
 * `frozenAmount` is a string because the column is `numeric`: the fee is
 * quoted when the hold is taken and must not drift, and routing money through
 * a float is how rounding errors get introduced. Callers hand it to the
 * provider as-is.
 *
 * The `slot_holds` table is a second, parallel mechanism for the same concept
 * — see the README's "Known duplication: two hold mechanisms".
 */
export class BookingHold {
  constructor(
    public readonly id: string,
    public readonly userId: string,
    public readonly doctorId: string,
    public readonly clinicId: string,
    public readonly scheduledAt: Date,
    public readonly frozenAmount: string,
    public status: BookingHoldStatus,
    public readonly expiresAt: Date,
    /** Set when this hold replaces an existing appointment. */
    public readonly reschedulesAppointmentId: string | null,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
  ) {}

  isHeldBy(userId: string): boolean {
    return this.userId === userId;
  }

  /** Payable only while still HELD; a lapsed or paid hold is not. */
  isPayable(): boolean {
    return this.status === BookingHoldStatus.HELD;
  }

  isAwaitingPayment(): boolean {
    return this.status === BookingHoldStatus.PAYMENT_PENDING;
  }

  isExpired(now: Date): boolean {
    return now >= this.expiresAt;
  }
}
