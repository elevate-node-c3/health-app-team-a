/**
 * A Home-ready view of one appointment: the appointment plus the doctor/clinic
 * fields the card renders, resolved in a single query so Home stays one request
 * (BR-01). Only ever built for signed-in users (BR-03/BR-04).
 */
export interface AppointmentCard {
  id: string;
  scheduledAt: Date;
  doctorId: string;
  doctorName: string;
  doctorPhoto: string | null;
  specialtyName: string;
  clinicName: string | null;
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
}

export const APPOINTMENT_REPOSITORY = Symbol('APPOINTMENT_REPOSITORY');
