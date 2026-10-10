import { createHmac } from 'crypto';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { AppointmentHistoryService } from './appointment-history.service';
import { InternalAdminGuard } from './appointment.controller';
import { AppointmentStatus } from './domain/enums/appointment-status.enum';
import { AppointmentHistoryQueryDto } from './dto/appointment-history-query.dto';

import type {
  AppointmentRepository,
  AppointmentRecord,
  AppointmentHistoryRow,
} from './domain/repositories/appointment.repository';
import type {
  Prescription,
  PrescriptionRepository,
} from './domain/repositories/prescription.repository';

const userId = '11111111-1111-4111-8111-111111111111';
const appointmentId = '22222222-2222-4222-8222-222222222222';
const doctorId = '33333333-3333-4333-8333-333333333333';
const now = new Date('2026-09-28T12:00:00.000Z');

describe('InternalAdminGuard', () => {
  const apiKey = 'test-internal-admin-api-key-with-32-chars';

  const guardWithHeaders = (headers: Record<string, string>) => {
    const request = { get: (name: string) => headers[name] };
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
    };
    return new InternalAdminGuard({ get: () => apiKey } as never).canActivate(
      context as never,
    );
  };

  it('accepts a valid internal key and audit actor', () => {
    expect(
      guardWithHeaders({
        'x-internal-admin-key': apiKey,
        'x-internal-actor-id': 'admin:42',
      }),
    ).toBe(true);
  });

  it('rejects patient-only, incorrect-key, and missing-actor requests', () => {
    expect(() => guardWithHeaders({})).toThrow(
      'Internal admin credentials required',
    );
    expect(() =>
      guardWithHeaders({
        'x-internal-admin-key': 'wrong-key',
        'x-internal-actor-id': 'admin:42',
      }),
    ).toThrow('Internal admin credentials required');
    expect(() => guardWithHeaders({ 'x-internal-admin-key': apiKey })).toThrow(
      'Internal admin credentials required',
    );
  });
});

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
  let findHistoryPage: jest.MockedFunction<
    AppointmentRepository['findHistoryPage']
  >;
  let findPrescription: jest.MockedFunction<
    PrescriptionRepository['findForAppointment']
  >;
  let unitOfWorkExecute: jest.Mock<
    (work: (repositories: never) => Promise<unknown>) => Promise<unknown>
  >;

  const givenPage = (rows: AppointmentHistoryRow[], hasMore = false) =>
    findHistoryPage.mockResolvedValue({ rows, hasMore });

  beforeEach(() => {
    findHistoryPage = jest.fn<AppointmentRepository['findHistoryPage']>();
    findPrescription = jest.fn<PrescriptionRepository['findForAppointment']>();
    unitOfWorkExecute =
      jest.fn<
        (work: (repositories: never) => Promise<unknown>) => Promise<unknown>
      >();
    givenPage([]);

    const configService = { getOrThrow: () => 'test-prescription-secret' };
    // The unit of work and the prescription port are unused by `list`, which
    // is all this file covers; a stub that would throw if touched keeps that
    // honest.
    const unitOfWork = { execute: unitOfWorkExecute };
    const prescriptions = { findForAppointment: findPrescription };

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
          findByIdForUpdate: jest
            .fn<(id: string) => Promise<AppointmentRecord | null>>()
            .mockResolvedValue({
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
          existsForAppointment: jest
            .fn<(id: string) => Promise<boolean>>()
            .mockResolvedValue(exists),
          issue: jest
            .fn<
              (
                appointmentId: string,
                userId: string,
                storageKey: string,
              ) => Promise<Prescription>
            >()
            .mockResolvedValue(prescription),
        },
        appendEvent: jest.fn(),
      };
      unitOfWorkExecute.mockImplementation((work) =>
        work(repositories as never),
      );
      return { repositories, prescription };
    };

    it('rejects missing and unsupported content', async () => {
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
      ).rejects.toThrow('Prescription file must be a PDF or supported image');
      expect(unitOfWorkExecute).not.toHaveBeenCalled();
    });

    it.each([
      ['JPEG', [0xff, 0xd8, 0xff, 0x00]],
      ['PNG', [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
      [
        'WebP',
        [
          ...Buffer.from('RIFF'),
          0x00,
          0x00,
          0x00,
          0x00,
          ...Buffer.from('WEBP'),
        ],
      ],
    ])(
      'accepts %s image content independent of its filename',
      async (_format, signature) => {
        const { repositories } = givenTransaction();
        const directory = await mkdtemp(
          join(tmpdir(), 'appointment-prescription-image-'),
        );
        const previousDirectory = process.env.PRESCRIPTION_STORAGE_DIR;
        process.env.PRESCRIPTION_STORAGE_DIR = directory;

        try {
          await service.attachPrescription(
            doctorId,
            appointmentId,
            { buffer: Buffer.from(signature) },
            now,
          );
          expect(repositories.prescriptions.issue).toHaveBeenCalled();
        } finally {
          if (previousDirectory === undefined)
            delete process.env.PRESCRIPTION_STORAGE_DIR;
          else process.env.PRESCRIPTION_STORAGE_DIR = previousDirectory;
          await rm(directory, { recursive: true, force: true });
        }
      },
    );

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

    it('rejects a duplicate prescription', async () => {
      givenTransaction({}, true);

      await expect(
        service.attachPrescription(doctorId, appointmentId, pdf, now),
      ).rejects.toThrow('A prescription has already been issued');
    });

    it('allows an internal admin actor and records who attached the prescription', async () => {
      const { repositories, prescription } = givenTransaction();
      const actorId = 'admin:42';
      const directory = await mkdtemp(
        join(tmpdir(), 'appointment-prescription-'),
      );
      const previousDirectory = process.env.PRESCRIPTION_STORAGE_DIR;
      process.env.PRESCRIPTION_STORAGE_DIR = directory;

      try {
        await expect(
          service.attachPrescription(actorId, appointmentId, pdf, now),
        ).resolves.toEqual(prescription);

        expect(repositories.prescriptions.issue).toHaveBeenCalledWith(
          appointmentId,
          userId,
          expect.any(String),
        );
        expect(repositories.appendEvent).toHaveBeenCalledWith(
          'appointment.prescription.issued',
          expect.objectContaining({
            attachedBy: actorId,
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

    it('returns the detected image content type from the signed download path', async () => {
      const directory = await mkdtemp(
        join(tmpdir(), 'appointment-prescription-download-'),
      );
      const previousDirectory = process.env.PRESCRIPTION_STORAGE_DIR;
      process.env.PRESCRIPTION_STORAGE_DIR = directory;
      const storageKey = 'stored-image';
      const expiresAt = Math.floor(now.getTime() / 1000) + 60;
      const signature = createHmac('sha256', 'test-prescription-secret')
        .update(`${userId}:${appointmentId}:${expiresAt}`)
        .digest('hex');
      findPrescription.mockResolvedValue({
        id: '44444444-4444-4444-8444-444444444444',
        userId,
        appointmentId,
        storageKey,
        issuedAt: now,
      });

      try {
        await writeFile(
          join(directory, storageKey),
          Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        );

        await expect(
          service.prescriptionFile(
            userId,
            appointmentId,
            expiresAt,
            signature,
            now,
          ),
        ).resolves.toEqual({
          path: join(directory, storageKey),
          contentType: 'image/png',
        });
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
