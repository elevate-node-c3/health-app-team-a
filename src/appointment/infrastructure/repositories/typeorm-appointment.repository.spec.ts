import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { AppointmentStatus } from 'src/appointment/domain/enums/appointment-status.enum';

import { TypeOrmAppointmentRepository } from './typeorm-appointment.repository';

import type { AppointmentOrmEntity } from 'src/appointment/infrastructure/entities/typeorm/appointment.entity';

const userId = '11111111-1111-4111-8111-111111111111';
const appointmentId = '22222222-2222-4222-8222-222222222222';
const otherId = '33333333-3333-4333-8333-333333333333';
const now = new Date('2026-09-28T12:00:00.000Z');

type RawRow = {
  appointment_id: string;
  prescriptionStorageKey: string | null;
};

/**
 * Covers the half of the history page that is the query's own business: which
 * rows the tab admits, the keyset predicate, the over-read that decides
 * `hasMore`, and the snapshot fallbacks. The chain is stubbed because asserting
 * generated SQL is the only way to pin a filter without a live database; the
 * mapping assertions below need no SQL and carry most of the value.
 */
describe('TypeOrmAppointmentRepository.findHistoryPage', () => {
  let repository: TypeOrmAppointmentRepository;
  let queryBuilder: Record<string, jest.Mock>;
  let entities: Partial<AppointmentOrmEntity>[];
  let raw: RawRow[];

  /** Every chained call returns the builder; only the terminal call resolves. */
  const chain = () => queryBuilder;

  beforeEach(() => {
    entities = [];
    raw = [];
    queryBuilder = {
      leftJoinAndSelect: jest.fn(chain),
      leftJoin: jest.fn(chain),
      addSelect: jest.fn(chain),
      where: jest.fn(chain),
      andWhere: jest.fn(chain),
      orderBy: jest.fn(chain),
      addOrderBy: jest.fn(chain),
      take: jest.fn(chain),
      getRawAndEntities: jest.fn(() => Promise.resolve({ entities, raw })),
    };

    repository = new TypeOrmAppointmentRepository({
      createQueryBuilder: jest.fn(() => queryBuilder),
    } as never);
  });

  const find = (overrides: Record<string, unknown> = {}) =>
    repository.findHistoryPage({
      userId,
      tab: 'all',
      cursor: null,
      limit: 20,
      now,
      ...overrides,
    } as never);

  it('scopes every page to the requesting patient', async () => {
    await find();

    expect(queryBuilder.where).toHaveBeenCalledWith(
      'appointment.userId = :userId',
      { userId },
    );
  });

  describe('tab filter', () => {
    it('limits `upcoming` to scheduled appointments still in the future', async () => {
      await find({ tab: 'upcoming' });

      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        'appointment.status = :scheduled',
        { scheduled: AppointmentStatus.SCHEDULED },
      );
      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        'appointment.scheduledAt > :now',
        { now },
      );
    });

    // An elapsed SCHEDULED appointment must appear here, because nothing
    // sweeps the stored status and it would otherwise fall out of every tab.
    it('includes elapsed scheduled appointments in `completed`', async () => {
      await find({ tab: 'completed' });

      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('appointment.scheduledAt <= :now'),
        expect.objectContaining({ now }),
      );
    });

    it('limits `cancelled` to cancelled appointments', async () => {
      await find({ tab: 'cancelled' });

      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        'appointment.status = :cancelled',
        { cancelled: AppointmentStatus.CANCELLED },
      );
    });

    it('applies no status filter for `all`', async () => {
      await find({ tab: 'all' });

      expect(queryBuilder.andWhere).not.toHaveBeenCalled();
    });
  });

  describe('paging', () => {
    it('over-reads by one so `hasMore` needs no second query', async () => {
      await find({ limit: 5 });

      expect(queryBuilder.take).toHaveBeenCalledWith(6);
    });

    it('reports hasMore and trims the extra row', async () => {
      entities = [
        { id: appointmentId, status: AppointmentStatus.SCHEDULED },
        { id: otherId, status: AppointmentStatus.SCHEDULED },
      ];

      const page = await find({ limit: 1 });

      expect(page.hasMore).toBe(true);
      expect(page.rows).toHaveLength(1);
      expect(page.rows[0].id).toBe(appointmentId);
    });

    it('reports no further page when the over-read finds nothing extra', async () => {
      entities = [{ id: appointmentId, status: AppointmentStatus.SCHEDULED }];

      const page = await find({ limit: 1 });

      expect(page.hasMore).toBe(false);
      expect(page.rows).toHaveLength(1);
    });

    it('pages on (scheduledAt, id) so a tie cannot repeat or skip a row', async () => {
      const cursor = { scheduledAt: now, id: appointmentId };

      await find({ cursor });

      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('appointment.id < :cursorId'),
        { cursorAt: cursor.scheduledAt, cursorId: cursor.id },
      );
      expect(queryBuilder.addOrderBy).toHaveBeenCalledWith(
        'appointment.id',
        'DESC',
      );
    });
  });

  describe('row mapping', () => {
    it('prefers the booking-time snapshot over the live relation', async () => {
      entities = [
        {
          id: appointmentId,
          status: AppointmentStatus.SCHEDULED,
          doctorNameSnapshot: 'Dr. Ada As Booked',
          specialtyNameSnapshot: 'Cardiology As Booked',
          clinicNameSnapshot: 'Clinic As Booked',
          clinicAreaSnapshot: 'Cairo, Cairo',
          doctor: { name: 'Dr. Ada Renamed', photo: null },
          clinic: { name: 'Clinic Renamed' },
        } as never,
      ];

      const [row] = (await find()).rows;

      expect(row).toMatchObject({
        doctorName: 'Dr. Ada As Booked',
        specialtyName: 'Cardiology As Booked',
        clinicName: 'Clinic As Booked',
        clinicArea: 'Cairo, Cairo',
      });
    });

    it('falls back to the live relation, then to a placeholder', async () => {
      entities = [
        {
          id: appointmentId,
          status: AppointmentStatus.SCHEDULED,
          doctor: {
            name: 'Dr. Live',
            photo: null,
            specialty: { name: 'Derm' },
          },
          clinic: { name: 'Live Clinic', city: 'Giza', governorate: 'Giza' },
        } as never,
        { id: otherId, status: AppointmentStatus.CANCELLED },
      ];

      const [live, gone] = (await find()).rows;

      expect(live).toMatchObject({
        doctorName: 'Dr. Live',
        specialtyName: 'Derm',
        clinicName: 'Live Clinic',
        clinicArea: 'Giza, Giza',
      });
      expect(gone).toMatchObject({
        doctorName: 'Doctor',
        specialtyName: 'Specialty unavailable',
        clinicName: null,
        clinicArea: null,
      });
    });

    it('marks a row rebookable only when the doctor and clinic are both live', async () => {
      entities = [
        {
          id: appointmentId,
          status: AppointmentStatus.CANCELLED,
          doctorId: otherId,
          clinicId: appointmentId,
          doctor: { isVerified: true },
          clinic: { isActive: true },
        } as never,
        {
          id: otherId,
          status: AppointmentStatus.CANCELLED,
          doctorId: otherId,
          clinicId: appointmentId,
          doctor: { isVerified: true },
          clinic: { isActive: false },
        } as never,
      ];

      const rows = (await find()).rows;

      expect(rows[0].rebookable).toBe(true);
      expect(rows[1].rebookable).toBe(false);
    });

    // Matched by appointment id rather than by row position, so the mapping
    // cannot silently shift if the join ever changes shape.
    it('attaches each prescription key to its own appointment', async () => {
      entities = [
        { id: appointmentId, status: AppointmentStatus.COMPLETED },
        { id: otherId, status: AppointmentStatus.COMPLETED },
      ];
      raw = [
        { appointment_id: otherId, prescriptionStorageKey: 'key-other' },
        {
          appointment_id: appointmentId,
          prescriptionStorageKey: 'key-first',
        },
      ];

      const rows = (await find()).rows;

      expect(rows[0].prescriptionStorageKey).toBe('key-first');
      expect(rows[1].prescriptionStorageKey).toBe('key-other');
    });

    it('leaves the prescription key null when none was issued', async () => {
      entities = [{ id: appointmentId, status: AppointmentStatus.COMPLETED }];

      const [row] = (await find()).rows;

      expect(row.prescriptionStorageKey).toBeNull();
    });
  });
});
