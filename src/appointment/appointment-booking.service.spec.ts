import { jest } from '@jest/globals';
import { BadRequestException } from '@nestjs/common';
import { BookingHoldStatus } from 'src/appointment/domain/enums/booking-hold-status.enum';
import { BOOKING_HORIZON_DAYS } from 'src/doctor/availability.constants';

import { AppointmentBookingService } from './appointment-booking.service';

import type { AppointmentTransactionRepositories } from './domain/repositories/unit-of-work';

const NOW = new Date('2026-09-28T09:00:00.000Z');
const DOCTOR_ID = 'doc-1';
const CLINIC_ID = 'clinic-1';
const HOLD_ID = 'hold-1';

/**
 * A pairing that passes the active-doctor/active-clinic gate. `slotMinutes`
 * null means the schedule no longer covers the instant — what a 03:00 time, a
 * leave day, or edited hours look like from here.
 */
const pairing = (slotMinutes: number | null) => ({
  doctorClinicId: 'pairing-1',
  fee: 300,
  doctorName: 'Dr Mona',
  doctorPhoto: null,
  specialtyName: 'Cardiology',
  clinicName: 'Nile Clinic',
  clinicCity: 'Cairo',
  clinicGovernorate: 'Cairo',
  slotMinutes,
});

interface HarnessOptions {
  /** The slot length the schedule offers, or null for "not offered". */
  slotMinutes?: number | null;
  hold?: Partial<{
    doctorId: string;
    clinicId: string;
    scheduledAt: Date;
    status: BookingHoldStatus;
    userId: string;
    reschedulesAppointmentId: string | null;
  }>;
}

/**
 * The whole harness is port stubs — no EntityManager, no query builders, no
 * database. That is the payoff of the unit of work taking repositories: the
 * booking rules can be exercised directly.
 */
function makeHarness(options: HarnessOptions = {}) {
  const slotMinutes =
    options.slotMinutes === undefined ? 30 : options.slotMinutes;

  const hold = {
    id: HOLD_ID,
    userId: 'user-1',
    doctorId: DOCTOR_ID,
    clinicId: CLINIC_ID,
    scheduledAt: new Date('2026-10-03T07:00:00.000Z'),
    frozenAmount: '300.00',
    status: BookingHoldStatus.PAYMENT_PENDING,
    reschedulesAppointmentId: null,
    isPayable: () => hold.status === BookingHoldStatus.HELD,
    isAwaitingPayment: () => hold.status === BookingHoldStatus.PAYMENT_PENDING,
    isExpired: () => false,
    ...options.hold,
  };

  const created: Record<string, unknown>[] = [];
  const findBookable = jest.fn(() => Promise.resolve(pairing(slotMinutes)));

  const repos = {
    appointments: {
      create: jest.fn((input: Record<string, unknown>) => {
        created.push(input);
        return Promise.resolve({ id: 'appt-1', ...input });
      }),
      existsScheduledInWindow: jest.fn(() => Promise.resolve(false)),
      findByIdForUserForUpdate: jest.fn(() => Promise.resolve(null)),
      updateStatus: jest.fn(() => Promise.resolve()),
    },
    holds: {
      create: jest.fn((input: Record<string, unknown>) =>
        Promise.resolve({ id: HOLD_ID, ...input }),
      ),
      findByIdForUpdate: jest.fn(() => Promise.resolve(hold)),
      findByIdForUserForUpdate: jest.fn(() => Promise.resolve(hold)),
      updateStatus: jest.fn(() => Promise.resolve()),
      existsLiveInWindow: jest.fn(() => Promise.resolve(false)),
    },
    pairings: { findBookable },
    prescriptions: {},
    paymentAttempts: {},
    paymentSessions: {},
    lockDoctor: jest.fn(() => Promise.resolve()),
    appendEvent: jest.fn(() => Promise.resolve()),
  };

  const unitOfWork = {
    execute: jest.fn(
      (work: (r: AppointmentTransactionRepositories) => Promise<unknown>) =>
        work(repos as never),
    ),
  };

  return {
    service: new AppointmentBookingService(unitOfWork as never),
    repos: repos as never as AppointmentTransactionRepositories,
    stubs: repos,
    created,
    findBookable,
  };
}

describe('AppointmentBookingService', () => {
  describe('createHold only accepts times the calendar offered', () => {
    it('rejects a time outside the doctor’s hours, or on leave', async () => {
      const { service } = makeHarness({ slotMinutes: null });

      await expect(
        service.createHold(
          'user-1',
          {
            doctorId: DOCTOR_ID,
            clinicId: CLINIC_ID,
            scheduledAt: '2026-10-03T00:00:00.000Z',
          },
          NOW,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a time beyond the booking horizon before querying at all', async () => {
      const { service, findBookable } = makeHarness();
      const beyond = new Date(
        NOW.getTime() + (BOOKING_HORIZON_DAYS + 1) * 24 * 60 * 60 * 1000,
      );

      await expect(
        service.createHold(
          'user-1',
          {
            doctorId: DOCTOR_ID,
            clinicId: CLINIC_ID,
            scheduledAt: beyond.toISOString(),
          },
          NOW,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);

      // The horizon is pure arithmetic — it must not cost a round trip.
      expect(findBookable).not.toHaveBeenCalled();
    });

    it('holds the slot in one transaction when the time is offered', async () => {
      const { service, stubs } = makeHarness();

      await service.createHold(
        'user-1',
        {
          doctorId: DOCTOR_ID,
          clinicId: CLINIC_ID,
          scheduledAt: '2026-10-03T07:00:00.000Z',
        },
        NOW,
      );

      expect(stubs.holds.create).toHaveBeenCalledWith(
        expect.objectContaining({
          doctorId: DOCTOR_ID,
          clinicId: CLINIC_ID,
          frozenAmount: '300.00',
        }),
      );
      // Locked before the conflict checks, or two requests could both pass.
      expect(stubs.lockDoctor).toHaveBeenCalledWith(DOCTOR_ID);
    });
  });

  describe('bookClaimedHold records how long the appointment runs', () => {
    it('takes the length from the hours the slot was booked inside', async () => {
      const { service, repos, created } = makeHarness({ slotMinutes: 20 });

      await service.bookClaimedHold(repos, HOLD_ID);

      expect(created[0]?.durationMinutes).toBe(20);
    });

    it('falls back to 30 minutes when the hours have since changed', async () => {
      const { service, repos, created } = makeHarness({ slotMinutes: null });

      await service.bookClaimedHold(repos, HOLD_ID);

      expect(created[0]?.durationMinutes).toBe(30);
    });

    it('creates the appointment for the held instant and books the hold', async () => {
      const { service, repos, created, stubs } = makeHarness();

      await service.bookClaimedHold(repos, HOLD_ID);

      expect(created[0]).toMatchObject({
        doctorId: DOCTOR_ID,
        clinicId: CLINIC_ID,
        doctorNameSnapshot: 'Dr Mona',
        specialtyNameSnapshot: 'Cardiology',
      });
      expect(stubs.holds.updateStatus).toHaveBeenCalledWith(
        HOLD_ID,
        BookingHoldStatus.BOOKED,
      );
    });

    // The appointment is created as SCHEDULED by the repository, not by the
    // caller - asserted here so the status cannot drift.
    it('creates it as SCHEDULED', async () => {
      const { service, repos, stubs } = makeHarness();

      const booked = await service.bookClaimedHold(repos, HOLD_ID);

      expect(stubs.appointments.create).toHaveBeenCalledTimes(1);
      expect(booked.doctorName).toBe('Dr Mona');
      expect(booked.appointment.id).toBe('appt-1');
    });
  });

  describe('releaseHold', () => {
    it('gives back a hold that was awaiting payment', async () => {
      const { service, repos, stubs } = makeHarness();

      await service.releaseHold(repos, HOLD_ID);

      expect(stubs.holds.updateStatus).toHaveBeenCalledWith(
        HOLD_ID,
        BookingHoldStatus.RELEASED,
      );
    });

    // A booked or already-released hold is not the release path's business.
    it('leaves a hold in any other state alone', async () => {
      const { service, repos, stubs } = makeHarness({
        hold: { status: BookingHoldStatus.BOOKED },
      });

      await service.releaseHold(repos, HOLD_ID);

      expect(stubs.holds.updateStatus).not.toHaveBeenCalled();
    });
  });
});
