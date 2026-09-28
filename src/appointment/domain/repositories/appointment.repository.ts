/**
 * A Home-ready view of one appointment: the appointment plus the doctor/clinic
 * fields the card renders, resolved in a single query so Home stays one request
 * (BR-01). Only ever built for signed-in users (BR-03/BR-04).
 */
export interface AppointmentCard {
  id: string;
  scheduledAt: Date;
  doctorId: string | null;
  doctorName: string;
  doctorPhoto: string | null;
  specialtyName: string;
  clinicName: string | null;
}

/**
 * A booked instant at a doctor's clinic. Deliberately carries no patient data:
 * the availability endpoint is public, and all a stranger may learn is that a
 * time is unavailable — never who took it.
 */
export interface BookedInstant {
  scheduledAt: Date;
  /** Null for rows booked before the column existed; the reader supplies a fallback. */
  durationMinutes: number | null;
}

export interface AppointmentRepository {
  /**
   * The user's soonest future appointment still in SCHEDULED state, or null.
   */
  findNextUpcoming(userId: string, now: Date): Promise<AppointmentCard | null>;

  /**
   * The user's most recent COMPLETED appointment within `windowDays`, or null.
   */
  findMostRecentVisit(
    userId: string,
    now: Date,
    windowDays: number,
  ): Promise<AppointmentCard | null>;

  /**
   * Which instants are already taken for this doctor within `[from, to)`.
   * Scheduled appointments only — a cancelled one frees its time.
   *
   * Doctor-wide rather than per-clinic on purpose: a doctor cannot be in two
   * places at once, so a booking at one clinic blocks the same instant at every
   * other. That is what `UQ_appointments_doctor_instant` enforces, and a
   * clinic-scoped read would offer times the booking path always rejects.
   */
  findBookedInstantsForDoctor(
    doctorId: string,
    from: Date,
    to: Date,
  ): Promise<BookedInstant[]>;
}

export const APPOINTMENT_REPOSITORY = Symbol('APPOINTMENT_REPOSITORY');

