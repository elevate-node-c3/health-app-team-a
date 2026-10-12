import type { AppointmentStatus } from 'src/appointment/domain/enums/appointment-status.enum';
import type { AppointmentHistoryTab } from 'src/appointment/dto/appointment-history-query.dto';

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

/**
 * One row of booking history, with every snapshot fallback already resolved.
 *
 * The snapshots exist because a doctor can be renamed, or a clinic closed,
 * after an appointment was booked — the card must keep showing what the patient
 * actually booked. Choosing snapshot over live relation is a property of how
 * the row was loaded, so it is settled here rather than left to the caller.
 *
 * `status` is the stored status. Whether a past SCHEDULED appointment should
 * read as completed is a policy question about the current clock, so it stays
 * with the caller.
 */
export interface AppointmentHistoryRow {
  id: string;
  scheduledAt: Date;
  status: AppointmentStatus;
  doctorId: string | null;
  doctorName: string;
  doctorPhoto: string | null;
  specialtyName: string;
  clinicId: string | null;
  clinicName: string | null;
  clinicArea: string | null;
  /**
   * Whether the doctor/clinic pairing could still accept a new booking — the
   * doctor is still verified and the clinic still active. Decides only whether
   * a RE_BOOK action is offered.
   */
  rebookable: boolean;
  /** Storage key of the prescription, if one was issued. */
  prescriptionStorageKey: string | null;
}

/** Keyset position: the last row of the previous page. */
export interface AppointmentHistoryCursor {
  scheduledAt: Date;
  id: string;
}

export interface AppointmentHistoryPage {
  rows: AppointmentHistoryRow[];
  /** True when more rows exist beyond this page. */
  hasMore: boolean;
}

export interface FindHistoryPageInput {
  userId: string;
  tab: AppointmentHistoryTab;
  /** Null for the first page. */
  cursor: AppointmentHistoryCursor | null;
  limit: number;
  /** Decides what `upcoming` and `completed` mean for the tab filter. */
  now: Date;
}

/**
 * A new appointment, with the doctor/clinic display fields snapshotted.
 *
 * The snapshots are taken at booking time on purpose: a doctor may later be
 * renamed or a clinic closed, and the card must keep showing what the patient
 * actually booked.
 */
export interface CreateAppointmentInput {
  userId: string;
  doctorId: string;
  clinicId: string;
  scheduledAt: Date;
  /**
   * How long the appointment runs, from the hours it was booked inside.
   * Availability blocks the slots a booking overlaps, so a wrong value here
   * makes a 20-minute booking read as 30.
   */
  durationMinutes: number;
  doctorNameSnapshot: string;
  doctorPhotoSnapshot: string | null;
  specialtyNameSnapshot: string;
  clinicNameSnapshot: string | null;
  clinicAreaSnapshot: string | null;
}

/** What a "your appointment is booked" message is built from. */
export interface AppointmentReceipt {
  id: string;
  scheduledAt: Date;
  doctorName: string;
  clinicName: string | null;
}

export interface AppointmentReminder extends AppointmentReceipt {
  userId: string;
}

/** An appointment as the booking and cancellation paths need to see it. */
export interface AppointmentRecord {
  id: string;
  userId: string;
  doctorId: string | null;
  clinicId: string | null;
  scheduledAt: Date;
  status: AppointmentStatus;
}

export interface AppointmentRepository {
  /**
   * One page of the user's booking history, newest first, keyset-paginated on
   * `(scheduledAt, id)` so the page does not shift as rows are added.
   */
  findHistoryPage(input: FindHistoryPageInput): Promise<AppointmentHistoryPage>;

  create(input: CreateAppointmentInput): Promise<AppointmentRecord>;

  findByIdForUser(
    id: string,
    userId: string,
  ): Promise<AppointmentRecord | null>;

  /** Row-locked read; only meaningful inside a unit of work. */
  findByIdForUserForUpdate(
    id: string,
    userId: string,
  ): Promise<AppointmentRecord | null>;

  /**
   * Row-locked read with no owner scope, for the internal prescription-issuing
   * path — which acts on an appointment without a patient in the request.
   */
  findByIdForUpdate(id: string): Promise<AppointmentRecord | null>;

  updateStatus(id: string, status: AppointmentStatus): Promise<void>;

  /**
   * The fields a payment confirmation message needs, with the booking-time
   * snapshots already resolved. Owner-scoped, so one patient can never read
   * another's receipt.
   */
  findReceipt(id: string, userId: string): Promise<AppointmentReceipt | null>;

  claimDueReminders(
    dueBefore: Date,
    limit: number,
  ): Promise<AppointmentReminder[]>;

  /**
   * Whether this doctor already has a scheduled appointment starting inside
   * the half-open window `(after, before)`. The window is passed as instants
   * so the rule about how long an appointment blocks stays in the application.
   */
  existsScheduledInWindow(
    doctorId: string,
    after: Date,
    before: Date,
  ): Promise<boolean>;

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
