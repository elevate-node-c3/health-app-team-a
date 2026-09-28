import { jest } from '@jest/globals';
import { BadRequestException } from '@nestjs/common';
import { AppointmentStatus } from 'src/appointment/domain/enums/appointment-status.enum';
import { BookingHoldStatus } from 'src/appointment/domain/enums/booking-hold-status.enum';
import { AppointmentOrmEntity } from 'src/appointment/infrastructure/entities/typeorm/appointment.entity';
import { BookingHoldOrmEntity } from 'src/appointment/infrastructure/entities/typeorm/booking-hold.entity';
import { BOOKING_HORIZON_DAYS } from 'src/doctor/availability.constants';

import { AppointmentBookingService } from './appointment-booking.service';

const NOW = new Date('2026-09-28T09:00:00.000Z');
const DOCTOR_ID = 'doc-1';
const CLINIC_ID = 'clinic-1';
const HOLD_ID = 'hold-1';

/** A pairing that passes the active-doctor/active-clinic gate. */
const PAIRING = {
  id: 'pairing-1',
  doctorId: DOCTOR_ID,
  clinicId: CLINIC_ID,
  fee: 300,
  doctor: { name: 'Dr Mona' },
  clinic: { name: 'Nile Clinic' },
};

/**
 * A query-builder stub for `findOfferedSlot`, the one place that still needs
 * a builder: every builder method returns the chain, and `getRawOne` answers
 * with whatever the caller set up.
 */
function queryBuilder(rawOne: unknown) {
  const chain: Record<string, unknown> = {};
  const self = () => chain;

  for (const method of [
    'select',
    'addSelect',
    'innerJoin',
    'where',
    'andWhere',
    'setParameter',
    'orderBy',
  ])
    chain[method] = jest.fn(self);

  chain.getRawOne = jest.fn(() => Promise.resolve(rawOne ?? undefined));
  return chain;
}

interface HarnessOptions {
  /** The row `findOfferedSlot` resolves to; undefined means "not offered". */
  offered?: { slotMinutes: number; fee: string };
  hold?: Partial<{
    doctorId: string;
    clinicId: string;
    scheduledAt: Date;
    status: BookingHoldStatus;
    userId: string;
  }>;
}

function makeHarness(options: HarnessOptions = {}) {
  const saved: Record<string, unknown>[] = [];

  const hold = {
    id: HOLD_ID,
    userId: 'user-1',
    doctorId: DOCTOR_ID,
    clinicId: CLINIC_ID,
    scheduledAt: new Date('2026-10-03T07:00:00.000Z'),
    status: BookingHoldStatus.PAYMENT_PENDING,
    ...options.hold,
  };

  const manager = {
    // The advisory doctor lock.
    query: jest.fn(() => Promise.resolve([])),
    getRepository: jest.fn((entity: unknown) => ({
      findOne: jest.fn(() =>
        Promise.resolve(entity === BookingHoldOrmEntity ? hold : PAIRING),
      ),
      // Nothing already booked or held in these tests.
      existsBy: jest.fn(() => Promise.resolve(false)),
      exists: jest.fn(() => Promise.resolve(false)),
    })),
    createQueryBuilder: jest.fn(() => queryBuilder(options.offered)),
    create: jest.fn((_entity: unknown, fields: Record<string, unknown>) => ({
      ...fields,
    })),
    save: jest.fn((entity: Record<string, unknown>) => {
      saved.push(entity);
      return Promise.resolve(entity);
    }),
  };

  const dataSource = {
    transaction: jest.fn((run: (manager: unknown) => Promise<unknown>) =>
      run(manager),
    ),
  };

  return {
    service: new AppointmentBookingService(dataSource as never),
    manager,
    saved,
  };
}

describe('AppointmentBookingService', () => {
  describe('createHold only accepts times the calendar offered', () => {
    it('rejects a time outside the doctor’s hours, or on leave', async () => {
      // `findOfferedSlot` finds no schedule row covering the instant, which is
      // what a 03:00 time or a leave day looks like from here.
      const { service } = makeHarness({ offered: undefined });

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
      const { service, manager } = makeHarness({
        offered: { slotMinutes: 30, fee: '300.00' },
      });
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
      expect(manager.createQueryBuilder).not.toHaveBeenCalled();
    });
  });

  describe('bookClaimedHold records how long the appointment runs', () => {
    it('takes the length from the hours the slot was booked inside', async () => {
      const { service, manager, saved } = makeHarness({
        offered: { slotMinutes: 20, fee: '300.00' },
      });

      await service.bookClaimedHold(manager as never, HOLD_ID);

      const appointment = saved.find(
        (entity) => entity.status === AppointmentStatus.SCHEDULED,
      );
      expect(appointment?.durationMinutes).toBe(20);
    });

    it('falls back to 30 minutes when the hours have since changed', async () => {
      // The hold was taken against a schedule row that no longer covers it.
      const { service, manager, saved } = makeHarness({ offered: undefined });

      await service.bookClaimedHold(manager as never, HOLD_ID);

      const appointment = saved.find(
        (entity) => entity.status === AppointmentStatus.SCHEDULED,
      );
      expect(appointment?.durationMinutes).toBe(30);
    });

    it('creates the appointment as SCHEDULED for the held instant', async () => {
      const { service, manager } = makeHarness({
        offered: { slotMinutes: 30, fee: '300.00' },
      });

      await service.bookClaimedHold(manager as never, HOLD_ID);

      expect(manager.create).toHaveBeenCalledWith(
        AppointmentOrmEntity,
        expect.objectContaining({
          doctorId: DOCTOR_ID,
          clinicId: CLINIC_ID,
          status: AppointmentStatus.SCHEDULED,
        }),
      );
    });
  });
});
