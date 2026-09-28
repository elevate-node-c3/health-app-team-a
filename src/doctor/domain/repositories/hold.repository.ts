/**
 * An instant a live hold has taken off the board. Deliberately carries no
 * patient data: the availability endpoint is public, and all a stranger may
 * learn is that a time is unavailable — never who is holding it.
 */
export interface HeldInstant {
  scheduledAt: Date;
  /** Neither hold table records a length; the reader supplies a fallback. */
  durationMinutes: number | null;
}

/**
 * Holds are the other half of "unbookable". An appointment is permanent; a hold
 * lasts minutes while someone pays, and until it lapses that time cannot be
 * booked by anyone else.
 *
 * Two independent hold mechanisms exist — `booking_holds` behind
 * `POST /appointments/holds`, and `slot_holds` behind `POST /slot-holds`. Both
 * are routed, so availability reads both rather than guessing which one the
 * patient will meet.
 */
export interface HoldRepository {
  /**
   * Instants a live hold occupies for this doctor within `[from, to)`. Scoped
   * to the doctor rather than one clinic, because a doctor held at one clinic
   * cannot be booked at another for the same instant.
   */
  findHeldInstants(
    doctorId: string,
    from: Date,
    to: Date,
    now: Date,
  ): Promise<HeldInstant[]>;
}

export const HOLD_REPOSITORY = Symbol('HOLD_REPOSITORY');
