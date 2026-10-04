/**
 * A doctor-at-clinic pairing that can currently take bookings, with the
 * display fields an appointment snapshots at booking time.
 *
 * "Bookable" is three conditions together: the pairing is active, the clinic
 * is active, and the doctor is verified. The same gate guards the public
 * profile and availability, so a pairing whose profile 404s can never be
 * booked.
 */
export interface BookablePairingSnapshot {
  doctorClinicId: string;
  /** The pairing's fee, as a number — only ever compared and formatted. */
  fee: number;
  doctorName: string;
  doctorPhoto: string | null;
  specialtyName: string;
  clinicName: string | null;
  clinicCity: string | null;
  clinicGovernorate: string | null;
  /** The slot length at the booked instant, if the hours still offer it. */
  slotMinutes: number | null;
}

export interface BookablePairingRepository {
  /**
   * The pairing as it stands, or null when any of the three conditions fails.
   *
   * `scheduledAt` is needed because `slotMinutes` comes from the schedule row
   * covering that instant — the posted hours may have been edited since the
   * hold was taken, so the caller needs a fallback when it is null.
   */
  findBookable(
    doctorId: string,
    clinicId: string,
    scheduledAt: Date,
  ): Promise<BookablePairingSnapshot | null>;
}

export const BOOKABLE_PAIRING_REPOSITORY = Symbol(
  'BOOKABLE_PAIRING_REPOSITORY',
);
