import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { AppointmentHistoryService } from './appointment-history.service';
import { AppointmentStatus } from './domain/enums/appointment-status.enum';
import { AppointmentHistoryQueryDto } from './dto/appointment-history-query.dto';

import type {
  AppointmentHistoryPage,
  AppointmentHistoryRow,
} from './domain/repositories/appointment.repository';

const userId = '11111111-1111-4111-8111-111111111111';
const appointmentId = '22222222-2222-4222-8222-222222222222';
const doctorId = '33333333-3333-4333-8333-333333333333';
const now = new Date('2026-09-28T12:00:00.000Z');

/** A row as the repository hands it over: snapshots already resolved. */
function makeRow(
  overrides: Partial<AppointmentHistoryRow> = {},
): AppointmentHistoryRow {
  return {
    id: appointmentId,
    scheduledAt: new Date('2026-10-01T09:00:00.000Z'),
    status: AppointmentStatus.SCHEDULED,
    doctorId,
    doctorName: 'Dr. Ada Example',
    doctorPhoto: null,
    specialtyName: 'Cardiology',
    clinicId: null,
    clinicName: 'Central Clinic',
    clinicArea: 'Cairo, Cairo',
    rebookable: false,
    prescriptionStorageKey: null,
    ...overrides,
  };
}

/**
 * Covers what the service decides on its own: display status, which actions are
 * offered, prescription availability, and the cursor. How the page is queried
 * now belongs to TypeOrmAppointmentRepository and is tested there.
 */
describe('AppointmentHistoryService', () => {
  let service: AppointmentHistoryService;
  let findHistoryPage: jest.Mock<() => Promise<AppointmentHistoryPage>>;
  let unitOfWorkExecute: jest.Mock;

  const givenPage = (rows: AppointmentHistoryRow[], hasMore = false) =>
    findHistoryPage.mockResolvedValue({ rows, hasMore });

  beforeEach(() => {
    findHistoryPage = jest.fn<() => Promise<AppointmentHistoryPage>>();
    unitOfWorkExecute = jest.fn();
    givenPage([]);

    const configService = { getOrThrow: () => 'test-prescription-secret' };
    // The unit of work and the prescription port are unused by `list`, which
    // is all this file covers; a stub that would throw if touched keeps that
    // honest.
    const unitOfWork = { execute: unitOfWorkExecute };
    const prescriptions = { findForAppointment: jest.fn() };

    service = new AppointmentHistoryService(
      configService as never,
      { findHistoryPage } as never,
      prescriptions as never,
      unitOfWork as never,
    );
  });

  it('returns a well-formed empty result', async () => {
    const result = await service.list(
      userId,
      new AppointmentHistoryQueryDto(),
      now,
    );

    expect(result).toEqual({ items: [], nextCursor: null, hasMore: false });
  });

  describe('attachPrescription', () => {
    const pdf = { buffer: Buffer.from('%PDF-1.7\ncontent') };

    const givenTransaction = (
      appointmentOverrides: Partial<{
        id: string;
        userId: string;
        doctorId: string | null;
        clinicId: string | null;
        scheduledAt: Date;
        status: AppointmentStatus;
      }> = {},
      exists = false,
    ) => {
      const prescription = {
        id: '44444444-4444-4444-8444-444444444444',
        appointmentId,
        userId,
        storageKey: 'prescription-key',
        issuedAt: now,
      };
      const repositories = {
        appointments: {
          findByIdForUpdate: jest.fn().mockResolvedValue({
            id: appointmentId,
            userId,
            doctorId,
            clinicId: null,
            scheduledAt: new Date('2026-09-27T09:00:00.000Z'),
            status: AppointmentStatus.COMPLETED,
            ...appointmentOverrides,
          }),
        },
        prescriptions: {
          existsForAppointment: jest.fn().mockResolvedValue(exists),
          issue: jest.fn().mockResolvedValue(prescription),
        },
        appendEvent: jest.fn(),
      };
      unitOfWorkExecute.mockImplementation((work) => work(repositories));
      return { repositories, prescription };
    };

    it('rejects missing and non-PDF content', async () => {
      await expect(
        service.attachPrescription(doctorId, appointmentId, undefined, now),
      ).rejects.toThrow('A prescription PDF file is required');
      await expect(
        service.attachPrescription(
          doctorId,
          appointmentId,
          { buffer: Buffer.from('not a pdf') },
          now,
        ),
      ).rejects.toThrow('Prescription file must be a valid PDF');
      expect(unitOfWorkExecute).not.toHaveBeenCalled();
    });

    it('rejects files larger than 10 MiB', async () => {
      await expect(
        service.attachPrescription(
          doctorId,
          appointmentId,
          { buffer: Buffer.alloc(10 * 1024 * 1024 + 1) },
          now,
        ),
      ).rejects.toThrow('Prescription file exceeds 10 MiB');
      expect(unitOfWorkExecute).not.toHaveBeenCalled();
    });

    it.each([
      [
        AppointmentStatus.SCHEDULED,
        new Date('2026-10-01T09:00:00.000Z'),
        'upcoming',
      ],
      [
        AppointmentStatus.CANCELLED,
        new Date('2026-09-27T09:00:00.000Z'),
        'cancelled',
      ],
      [
        AppointmentStatus.NO_SHOW,
        new Date('2026-09-27T09:00:00.000Z'),
        'no-show',
      ],
    ])(
      'rejects a %s appointment with its reason',
      async (status, scheduledAt, reason) => {
        givenTransaction({ status, scheduledAt });

        await expect(
          service.attachPrescription(doctorId, appointmentId, pdf, now),
        ).rejects.toThrow(
          `Prescription cannot be attached to a ${reason} appointment`,
        );
      },
    );

    it('rejects an upload from someone other than the appointment doctor', async () => {
      givenTransaction();

      await expect(
        service.attachPrescription(userId, appointmentId, pdf, now),
      ).rejects.toThrow(
        'Only the appointment doctor can attach a prescription',
      );
    });

    it('rejects a duplicate prescription', async () => {
      givenTransaction({}, true);

      await expect(
        service.attachPrescription(doctorId, appointmentId, pdf, now),
      ).rejects.toThrow('A prescription has already been issued');
    });

    it('stores a valid PDF privately and records the attaching actor and time', async () => {
      const { repositories, prescription } = givenTransaction();
      const directory = await mkdtemp(
        join(tmpdir(), 'appointment-prescription-'),
      );
      const previousDirectory = process.env.PRESCRIPTION_STORAGE_DIR;
      process.env.PRESCRIPTION_STORAGE_DIR = directory;

      try {
        await expect(
          service.attachPrescription(doctorId, appointmentId, pdf, now),
        ).resolves.toEqual(prescription);

        expect(repositories.prescriptions.issue).toHaveBeenCalledWith(
          appointmentId,
          userId,
          expect.any(String),
        );
        expect(repositories.appendEvent).toHaveBeenCalledWith(
          'appointment.prescription.issued',
          expect.objectContaining({
            attachedBy: doctorId,
            issuedAt: now.toISOString(),
          }),
        );
      } finally {
        if (previousDirectory === undefined)
          delete process.env.PRESCRIPTION_STORAGE_DIR;
        else process.env.PRESCRIPTION_STORAGE_DIR = previousDirectory;
        await rm(directory, { recursive: true, force: true });
      }
    });
  });

  it('asks the repository for the requested tab, limit and clock', async () => {
    await service.list(userId, { tab: 'upcoming', limit: 5 }, now);

    expect(findHistoryPage).toHaveBeenCalledWith({
      userId,
      tab: 'upcoming',
      cursor: null,
      limit: 5,
      now,
    });
  });

  it('renders upcoming actions from appointment status', async () => {
    givenPage([makeRow()]);

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
  });

  it('moves elapsed scheduled appointments to completed with a disabled prescription action', async () => {
    givenPage([
      makeRow({
        scheduledAt: new Date('2026-09-27T09:00:00.000Z'),
        status: AppointmentStatus.SCHEDULED,
      }),
    ]);

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

  // A storage key only records that a prescription was issued; the file must
  // still be on disk. There is no such file under the test storage directory,
  // so availability stays false and the action stays disabled.
  it('does not offer a prescription whose file is missing', async () => {
    givenPage([
      makeRow({
        scheduledAt: new Date('2026-09-27T09:00:00.000Z'),
        prescriptionStorageKey: 'not-on-disk',
      }),
    ]);

    const result = await service.list(
      userId,
      { tab: 'completed', limit: 20 },
      now,
    );

    expect(result.items[0]).toMatchObject({
      prescriptionAvailable: false,
      actions: [{ type: 'DOWNLOAD_PRESCRIPTION', enabled: false }],
    });
  });

  it('offers RE_BOOK on a cancelled appointment only while the pairing is bookable', async () => {
    givenPage([
      makeRow({ status: AppointmentStatus.CANCELLED, rebookable: true }),
    ]);
    const bookable = await service.list(
      userId,
      { tab: 'cancelled', limit: 20 },
      now,
    );
    expect(bookable.items[0].actions).toEqual([
      { type: 'RE_BOOK', enabled: true },
    ]);

    givenPage([
      makeRow({ status: AppointmentStatus.CANCELLED, rebookable: false }),
    ]);
    const notBookable = await service.list(
      userId,
      { tab: 'cancelled', limit: 20 },
      now,
    );
    expect(notBookable.items[0].actions).toEqual([
      { type: 'RE_BOOK', enabled: false },
    ]);
  });

  describe('keyset cursor', () => {
    it('emits a cursor built from the last row when another page exists', async () => {
      givenPage([makeRow()], true);

      const result = await service.list(userId, { tab: 'all', limit: 1 }, now);

      expect(result.hasMore).toBe(true);
      expect(result.nextCursor).toBeTruthy();
    });

    it('emits no cursor on the last page', async () => {
      givenPage([makeRow()], false);

      const result = await service.list(userId, { tab: 'all', limit: 1 }, now);

      expect(result.nextCursor).toBeNull();
    });

    // The cursor the service emits must be the cursor it can read back, or
    // paging past page one breaks.
    it('round-trips its own cursor back to the repository', async () => {
      const lastRow = makeRow();
      givenPage([lastRow], true);
      const first = await service.list(userId, { tab: 'all', limit: 1 }, now);

      await service.list(
        userId,
        { tab: 'all', limit: 1, cursor: first.nextCursor ?? undefined },
        now,
      );

      expect(findHistoryPage).toHaveBeenLastCalledWith(
        expect.objectContaining({
          cursor: { scheduledAt: lastRow.scheduledAt, id: lastRow.id },
        }),
      );
    });

    it('rejects a malformed cursor', async () => {
      await expect(
        service.list(userId, { tab: 'all', limit: 1, cursor: 'nonsense' }, now),
      ).rejects.toThrow('Invalid appointment history cursor');
    });
  });
});
