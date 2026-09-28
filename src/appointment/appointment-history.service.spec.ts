import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { AppointmentHistoryService } from './appointment-history.service';
import { AppointmentStatus } from './domain/enums/appointment-status.enum';
import { AppointmentHistoryQueryDto } from './dto/appointment-history-query.dto';
import { AppointmentPrescriptionOrmEntity } from './infrastructure/entities/typeorm/appointment-prescription.entity';
import { AppointmentOrmEntity } from './infrastructure/entities/typeorm/appointment.entity';

describe('AppointmentHistoryService', () => {
  const userId = '11111111-1111-4111-8111-111111111111';
  const appointmentId = '22222222-2222-4222-8222-222222222222';
  const now = new Date('2026-09-28T12:00:00.000Z');
  let service: AppointmentHistoryService;
  let queryBuilder: Record<string, jest.Mock>;
  let appointmentRows: Partial<AppointmentOrmEntity>[];
  let prescriptionRows: Partial<AppointmentPrescriptionOrmEntity>[];
  let appointmentFind: jest.Mock;
  let prescriptionFind: jest.Mock;

  beforeEach(() => {
    appointmentRows = [];
    prescriptionRows = [];
    queryBuilder = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getMany: jest
        .fn()
        .mockImplementation(() => Promise.resolve(appointmentRows)),
    };
    appointmentFind = jest.fn();
    prescriptionFind = jest
      .fn()
      .mockReturnValue(Promise.resolve(prescriptionRows));
    const dataSource = {
      getRepository: jest.fn((entity: unknown) =>
        entity === AppointmentOrmEntity
          ? {
              createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
              findOneBy: appointmentFind,
            }
          : { find: prescriptionFind },
      ),
      transaction: jest.fn(),
    };
    const configService = { getOrThrow: () => 'test-prescription-secret' };
    service = new AppointmentHistoryService(
      dataSource as never,
      configService as never,
    );
  });

  it('returns a well-formed empty result scoped to the patient', async () => {
    const result = await service.list(
      userId,
      new AppointmentHistoryQueryDto(),
      now,
    );

    expect(result).toEqual({ items: [], nextCursor: null, hasMore: false });
    expect(queryBuilder.where).toHaveBeenCalledWith(
      'appointment.userId = :userId',
      { userId },
    );
  });

  it('renders upcoming actions from appointment status', async () => {
    appointmentRows = [
      {
        id: appointmentId,
        userId,
        doctorId: '33333333-3333-4333-8333-333333333333',
        clinicId: null,
        scheduledAt: new Date('2026-10-01T09:00:00.000Z'),
        status: AppointmentStatus.SCHEDULED,
        doctorNameSnapshot: 'Dr. Ada Example',
        doctorPhotoSnapshot: null,
        specialtyNameSnapshot: 'Cardiology',
        clinicNameSnapshot: 'Central Clinic',
        clinicAreaSnapshot: 'Cairo, Cairo',
      },
    ];

    const result = await service.list(
      userId,
      { tab: 'upcoming', limit: 20 },
      now,
    );

    expect(result.items[0]).toMatchObject({
      status: AppointmentStatus.SCHEDULED,
      doctor: { name: 'Dr. Ada Example', specialty: 'Cardiology' },
      clinic: { name: 'Central Clinic', area: 'Cairo, Cairo' },
      actions: [
        { type: 'CANCEL', enabled: true },
        { type: 'RESCHEDULE', enabled: true },
      ],
    });
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'appointment.scheduledAt > :now',
      { now },
    );
  });

  it('moves elapsed scheduled appointments to completed with a disabled prescription action', async () => {
    appointmentRows = [
      {
        id: appointmentId,
        userId,
        scheduledAt: new Date('2026-09-27T09:00:00.000Z'),
        status: AppointmentStatus.SCHEDULED,
        doctorNameSnapshot: 'Dr. Ada Example',
        specialtyNameSnapshot: 'Cardiology',
        clinicNameSnapshot: 'Central Clinic',
        clinicAreaSnapshot: 'Cairo, Cairo',
      },
    ];

    const result = await service.list(
      userId,
      { tab: 'completed', limit: 20 },
      now,
    );

    expect(result.items[0]).toMatchObject({
      status: AppointmentStatus.COMPLETED,
      prescriptionAvailable: false,
      actions: [{ type: 'DOWNLOAD_PRESCRIPTION', enabled: false }],
    });
  });

  it('uses the last card as a stable keyset cursor when another page exists', async () => {
    appointmentRows = [
      {
        id: appointmentId,
        scheduledAt: new Date('2026-10-01T09:00:00.000Z'),
        status: AppointmentStatus.SCHEDULED,
      },
      {
        id: '33333333-3333-4333-8333-333333333333',
        scheduledAt: new Date('2026-09-30T09:00:00.000Z'),
        status: AppointmentStatus.SCHEDULED,
      },
    ];

    const result = await service.list(userId, { tab: 'all', limit: 1 }, now);

    expect(result.hasMore).toBe(true);
    expect(result.nextCursor).toBeTruthy();
    expect(queryBuilder.addOrderBy).toHaveBeenCalledWith(
      'appointment.id',
      'DESC',
    );
  });
});
