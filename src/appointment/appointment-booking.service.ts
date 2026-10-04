import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AppointmentStatus } from 'src/appointment/domain/enums/appointment-status.enum';
import { BookingHoldStatus } from 'src/appointment/domain/enums/booking-hold-status.enum';
import { APPOINTMENT_UNIT_OF_WORK } from 'src/appointment/domain/repositories/unit-of-work';
import { CreateBookingHoldDto } from 'src/appointment/dto/create-booking-hold.dto';
import { BOOKING_HORIZON_DAYS } from 'src/doctor/availability.constants';

import type { BookingHold } from 'src/appointment/domain/entities/booking-hold.model';
import type { AppointmentRecord } from 'src/appointment/domain/repositories/appointment.repository';
import type {
  AppointmentTransactionRepositories,
  AppointmentUnitOfWork,
} from 'src/appointment/domain/repositories/unit-of-work';

const HOLD_TTL_MS = 10 * 60 * 1000;
const APPOINTMENT_DURATION_MS = 30 * 60 * 1000;
const HORIZON_MS = BOOKING_HORIZON_DAYS * 24 * 60 * 60 * 1000;

/** What a completed booking tells the payment flow, for its receipt. */
export interface BookedAppointment {
  appointment: AppointmentRecord;
  doctorName: string;
  clinicName: string | null;
}

/**
 * Holding a doctor's time, and turning a paid hold into an appointment.
 *
 * Three methods — `claimHold`, `bookClaimedHold`, `releaseHold` — take the
 * caller's transactional repositories rather than opening their own
 * transaction, because the payment flow must settle the attempt and the
 * booking together or neither. They take **ports**, never an `EntityManager`,
 * so the payment module never sees a TypeORM type.
 */
@Injectable()
export class AppointmentBookingService {
  constructor(
    @Inject(APPOINTMENT_UNIT_OF_WORK)
    private readonly unitOfWork: AppointmentUnitOfWork,
  ) {}

  async createHold(
    userId: string,
    dto: CreateBookingHoldDto,
    now: Date = new Date(),
  ): Promise<BookingHold> {
    const scheduledAt = this.parseFutureInstant(dto.scheduledAt, now);

    return this.unitOfWork.execute(async (repos) => {
      await repos.lockDoctor(dto.doctorId);
      return this.holdOfferedSlot(
        repos,
        userId,
        dto.doctorId,
        dto.clinicId,
        scheduledAt,
        now,
        null,
      );
    });
  }

  async createReplacementHold(
    userId: string,
    appointmentId: string,
    scheduledAtValue: string,
    mode: 'reschedule' | 'rebook',
    now: Date = new Date(),
  ): Promise<BookingHold> {
    const scheduledAt = this.parseFutureInstant(scheduledAtValue, now);

    return this.unitOfWork.execute(async (repos) => {
      // Read once unlocked only to learn which doctor to lock; everything that
      // decides the outcome is re-read under the lock below.
      const unlocked = await repos.appointments.findByIdForUser(
        appointmentId,
        userId,
      );
      if (!unlocked) throw new NotFoundException('Appointment not found');
      if (!unlocked.doctorId || !unlocked.clinicId)
        throw new ConflictException(
          'The original doctor or clinic is unavailable',
        );

      await repos.lockDoctor(unlocked.doctorId);

      const source = await repos.appointments.findByIdForUserForUpdate(
        appointmentId,
        userId,
      );
      if (!source) throw new NotFoundException('Appointment not found');
      if (!source.doctorId || !source.clinicId)
        throw new ConflictException(
          'The original doctor or clinic is unavailable',
        );

      // Rescheduling moves a live appointment; rebooking revives a cancelled
      // one. Each is only legal from its own starting status.
      const expectedStatus =
        mode === 'reschedule'
          ? AppointmentStatus.SCHEDULED
          : AppointmentStatus.CANCELLED;
      if (
        source.status !== expectedStatus ||
        (mode === 'reschedule' && source.scheduledAt <= now)
      )
        throw new ConflictException('This appointment cannot be replaced');

      return this.holdOfferedSlot(
        repos,
        userId,
        source.doctorId,
        source.clinicId,
        scheduledAt,
        now,
        source.id,
      );
    });
  }

  /**
   * Moves a hold to PAYMENT_PENDING so a charge can start against it.
   *
   * Runs in the caller's transaction: the payment attempt and this status
   * change must commit together, or a charge could exist against a hold that
   * was never claimed.
   */
  async claimHold(
    repos: AppointmentTransactionRepositories,
    userId: string,
    holdId: string,
    now: Date,
  ): Promise<BookingHold> {
    const hold = await repos.holds.findByIdForUserForUpdate(holdId, userId);
    if (!hold) throw new NotFoundException('Booking hold not found');
    if (!hold.isPayable())
      throw new ConflictException('This booking hold is no longer payable');

    if (hold.isExpired(now)) {
      await repos.holds.updateStatus(hold.id, BookingHoldStatus.EXPIRED);
      throw new ConflictException({
        code: 'BOOKING_HOLD_EXPIRED',
        message: 'Your time hold expired. Choose an appointment time again.',
        action: 'CHOOSE_TIME_AGAIN',
      });
    }

    // Re-checked at claim time: the doctor may have been unverified or the
    // clinic closed while the hold sat waiting for payment.
    const pairing = await repos.pairings.findBookable(
      hold.doctorId,
      hold.clinicId,
      hold.scheduledAt,
    );
    if (!pairing)
      throw new ConflictException({
        code: 'DOCTOR_UNAVAILABLE',
        message: 'This doctor or clinic is no longer available.',
        action: 'CHOOSE_ANOTHER_TIME',
      });

    await repos.holds.updateStatus(hold.id, BookingHoldStatus.PAYMENT_PENDING);
    hold.status = BookingHoldStatus.PAYMENT_PENDING;
    return hold;
  }

  /**
   * Turns a paid hold into an appointment, in the caller's transaction.
   *
   * Re-checks the slot under the doctor lock rather than trusting the claim:
   * minutes passed while the card was charged, and another booking may have
   * taken the time.
   */
  async bookClaimedHold(
    repos: AppointmentTransactionRepositories,
    holdId: string,
  ): Promise<BookedAppointment> {
    const hold = await repos.holds.findByIdForUpdate(holdId);
    if (!hold?.isAwaitingPayment())
      throw new ConflictException('The booking hold is not awaiting payment');

    await repos.lockDoctor(hold.doctorId);
    await this.assertNoAppointmentOverlap(
      repos,
      hold.doctorId,
      hold.scheduledAt,
    );

    const pairing = await repos.pairings.findBookable(
      hold.doctorId,
      hold.clinicId,
      hold.scheduledAt,
    );
    if (!pairing) throw new ConflictException('Doctor or clinic unavailable');

    const appointment = await repos.appointments.create({
      userId: hold.userId,
      doctorId: hold.doctorId,
      clinicId: hold.clinicId,
      scheduledAt: hold.scheduledAt,
      // The length the appointment really runs for, from the hours it was
      // booked inside. Availability blocks the slots a booking overlaps, so
      // leaving this wrong would make a 20-minute booking read as 30. The
      // hours may have been edited since the hold, hence the fallback.
      durationMinutes: pairing.slotMinutes ?? APPOINTMENT_DURATION_MS / 60_000,
      doctorNameSnapshot: pairing.doctorName,
      doctorPhotoSnapshot: pairing.doctorPhoto,
      specialtyNameSnapshot: pairing.specialtyName,
      clinicNameSnapshot: pairing.clinicName,
      clinicAreaSnapshot:
        [pairing.clinicCity, pairing.clinicGovernorate]
          .filter(Boolean)
          .join(', ') || null,
    });

    // A reschedule only cancels the appointment it replaces once the new one
    // exists, so a failure here never leaves the patient with neither.
    if (hold.reschedulesAppointmentId) {
      const source = await repos.appointments.findByIdForUserForUpdate(
        hold.reschedulesAppointmentId,
        hold.userId,
      );
      if (source?.status === AppointmentStatus.SCHEDULED)
        await repos.appointments.updateStatus(
          source.id,
          AppointmentStatus.CANCELLED,
        );
    }

    await repos.holds.updateStatus(hold.id, BookingHoldStatus.BOOKED);

    return {
      appointment,
      doctorName: pairing.doctorName,
      clinicName: pairing.clinicName,
    };
  }

  /**
   * Gives a claimed hold back after a failed payment, in the caller's
   * transaction. Silent when the hold is in any other state: a booked or
   * already-released hold is not the release path's business.
   */
  async releaseHold(
    repos: AppointmentTransactionRepositories,
    holdId: string,
  ): Promise<void> {
    const hold = await repos.holds.findByIdForUpdate(holdId);
    if (hold?.isAwaitingPayment())
      await repos.holds.updateStatus(hold.id, BookingHoldStatus.RELEASED);
  }

  /**
   * The shared tail of both hold paths: check the slot is really on offer and
   * really free, then take the hold. Assumes the doctor is already locked.
   */
  private async holdOfferedSlot(
    repos: AppointmentTransactionRepositories,
    userId: string,
    doctorId: string,
    clinicId: string,
    scheduledAt: Date,
    now: Date,
    reschedulesAppointmentId: string | null,
  ): Promise<BookingHold> {
    if (scheduledAt.getTime() > now.getTime() + HORIZON_MS)
      throw new BadRequestException(
        `Appointments can only be booked up to ${BOOKING_HORIZON_DAYS} days ahead`,
      );

    const pairing = await repos.pairings.findBookable(
      doctorId,
      clinicId,
      scheduledAt,
    );
    if (!pairing) throw new NotFoundException('Doctor or clinic unavailable');
    // A null slot length means the schedule does not offer this instant at
    // all - wrong day, outside hours, off the grid, or on leave.
    if (pairing.slotMinutes === null)
      throw new BadRequestException(
        'The doctor does not see patients at that time',
      );

    await this.assertSlotAvailable(repos, doctorId, scheduledAt, now);

    return repos.holds.create({
      userId,
      doctorId,
      clinicId,
      scheduledAt,
      frozenAmount: pairing.fee.toFixed(2),
      expiresAt: new Date(now.getTime() + HOLD_TTL_MS),
      reschedulesAppointmentId,
    });
  }

  private async assertSlotAvailable(
    repos: AppointmentTransactionRepositories,
    doctorId: string,
    scheduledAt: Date,
    now: Date,
  ): Promise<void> {
    await this.assertNoAppointmentOverlap(repos, doctorId, scheduledAt);

    const { after, before } = overlapWindow(scheduledAt);
    if (await repos.holds.existsLiveInWindow(doctorId, after, before, now))
      throw new ConflictException('This appointment time is held');
  }

  private async assertNoAppointmentOverlap(
    repos: AppointmentTransactionRepositories,
    doctorId: string,
    scheduledAt: Date,
  ): Promise<void> {
    const { after, before } = overlapWindow(scheduledAt);
    if (
      await repos.appointments.existsScheduledInWindow(doctorId, after, before)
    )
      throw new ConflictException('This appointment time is taken');
  }

  private parseFutureInstant(value: string, now: Date): Date {
    const instant = new Date(value);
    if (!Number.isFinite(instant.getTime()) || instant <= now)
      throw new BadRequestException('Choose a future appointment time');
    return instant;
  }
}

/**
 * The exclusive band around an instant: anything starting inside it would run
 * into the appointment, so the doctor cannot take both. Open at both ends, so
 * a booking exactly one slot earlier or later is still allowed.
 */
function overlapWindow(scheduledAt: Date): { after: Date; before: Date } {
  return {
    after: new Date(scheduledAt.getTime() - APPOINTMENT_DURATION_MS),
    before: new Date(scheduledAt.getTime() + APPOINTMENT_DURATION_MS),
  };
}
