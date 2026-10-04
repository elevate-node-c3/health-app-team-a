/**
 * A prescription issued for a completed appointment.
 *
 * `storageKey` names a file in the private prescription directory; whether
 * that file is actually present is a filesystem question the application
 * answers, not a database one.
 */
export interface Prescription {
  id: string;
  appointmentId: string;
  userId: string;
  storageKey: string;
  issuedAt: Date;
}

export interface PrescriptionRepository {
  findForAppointment(
    userId: string,
    appointmentId: string,
  ): Promise<Prescription | null>;

  /** At most one per appointment, enforced by a unique index. */
  existsForAppointment(appointmentId: string): Promise<boolean>;

  issue(
    appointmentId: string,
    userId: string,
    storageKey: string,
  ): Promise<Prescription>;
}

export const PRESCRIPTION_REPOSITORY = Symbol('PRESCRIPTION_REPOSITORY');
