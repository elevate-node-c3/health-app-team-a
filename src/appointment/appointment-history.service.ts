import { createHmac, timingSafeEqual } from 'crypto';
import { existsSync, realpathSync, statSync } from 'fs';
import { resolve, sep } from 'path';

import {
  ConflictException,
  GoneException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppointmentStatus } from 'src/appointment/domain/enums/appointment-status.enum';
import { APPOINTMENT_REPOSITORY } from 'src/appointment/domain/repositories/appointment.repository';
import { PRESCRIPTION_REPOSITORY } from 'src/appointment/domain/repositories/prescription.repository';
import { APPOINTMENT_UNIT_OF_WORK } from 'src/appointment/domain/repositories/unit-of-work';
import { APPOINTMENT_CANCELLED_EVENT } from 'src/infrastructure/messaging/event-names';
import { PaymentAttemptStatus } from 'src/payment-method/domain/enums/payment-attempt-status.enum';
import { PaymentSessionStatus } from 'src/payment-method/domain/enums/payment-session-status.enum';

import { PRESCRIPTION_ISSUED_EVENT } from './appointment-history.events';
import { AppointmentHistoryQueryDto } from './dto/appointment-history-query.dto';

import type {
  AppointmentRecord,
  AppointmentRepository,
} from 'src/appointment/domain/repositories/appointment.repository';
import type {
  Prescription,
  PrescriptionRepository,
} from 'src/appointment/domain/repositories/prescription.repository';
import type { AppointmentUnitOfWork } from 'src/appointment/domain/repositories/unit-of-work';

const PRESCRIPTION_LINK_TTL_SECONDS = 300;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type AppointmentAction = {
  type: 'CANCEL' | 'RESCHEDULE' | 'DOWNLOAD_PRESCRIPTION' | 'RE_BOOK';
  enabled: boolean;
};

@Injectable()
export class AppointmentHistoryService {
  constructor(
    private readonly configService: ConfigService,
    @Inject(APPOINTMENT_REPOSITORY)
    private readonly appointmentRepository: AppointmentRepository,
    @Inject(PRESCRIPTION_REPOSITORY)
    private readonly prescriptionRepository: PrescriptionRepository,
    @Inject(APPOINTMENT_UNIT_OF_WORK)
    private readonly unitOfWork: AppointmentUnitOfWork,
  ) {}

  async list(
    userId: string,
    query: AppointmentHistoryQueryDto,
    now: Date = new Date(),
  ) {
    const limit = query.limit ?? 20;
    const { rows, hasMore } = await this.appointmentRepository.findHistoryPage({
      userId,
      tab: query.tab ?? 'all',
      cursor: query.cursor ? this.decodeCursor(query.cursor) : null,
      limit,
      now,
    });

    const items = rows.map((row) => {
      const status = this.effectiveStatus(row, now);
      // Availability is a filesystem fact, not a database one: the row records
      // that a prescription was issued, this checks the file is still there.
      const prescriptionAvailable =
        status === AppointmentStatus.COMPLETED &&
        Boolean(
          row.prescriptionStorageKey &&
          this.getPrivateFilePath(row.prescriptionStorageKey),
        );

      return {
        id: row.id,
        scheduledAt: row.scheduledAt,
        doctor: {
          id: row.doctorId,
          name: row.doctorName,
          photo: row.doctorPhoto,
          specialty: row.specialtyName,
        },
        clinic: {
          id: row.clinicId,
          name: row.clinicName,
          area: row.clinicArea,
        },
        status,
        prescriptionAvailable,
        actions: this.actionsFor(status, prescriptionAvailable, row.rebookable),
      };
    });

    const last = rows.at(-1);
    return {
      items,
      nextCursor:
        hasMore && last ? this.encodeCursor(last.scheduledAt, last.id) : null,
      hasMore,
    };
  }

  async cancel(
    userId: string,
    appointmentId: string,
    now: Date = new Date(),
  ): Promise<{
    id: string;
    status: AppointmentStatus;
    refundStatus: string | null;
  }> {
    return this.unitOfWork.execute(async (repos) => {
      const appointment = await repos.appointments.findByIdForUserForUpdate(
        appointmentId,
        userId,
      );
      if (!appointment) throw new NotFoundException('Appointment not found');
      if (
        appointment.status !== AppointmentStatus.SCHEDULED ||
        appointment.scheduledAt <= now
      )
        throw new ConflictException('This appointment cannot be cancelled');

      await repos.appointments.updateStatus(
        appointment.id,
        AppointmentStatus.CANCELLED,
      );

      const receipt = await repos.appointments.findReceipt(
        appointment.id,
        userId,
      );
      await repos.appendEvent(APPOINTMENT_CANCELLED_EVENT, {
        userId,
        appointmentId: appointment.id,
        scheduledAt: appointment.scheduledAt.toISOString(),
        doctorName: receipt?.doctorName ?? 'your doctor',
      });

      // Hand the refund to the reconciliation loop rather than calling the
      // provider here: it owns retries, and this transaction must not wait on
      // a network round-trip. Same transaction as the cancellation, so the
      // appointment can never be cancelled with the money silently kept.
      const paid =
        await repos.paymentAttempts.findSucceededForAppointmentForUpdate(
          appointmentId,
          userId,
        );

      if (paid?.providerPaymentId) {
        await repos.paymentAttempts.recordOutcome(paid.id, {
          status: PaymentAttemptStatus.REFUND_PENDING,
        });
        await repos.paymentSessions.updateStatus(paid.id, {
          status: PaymentSessionStatus.REFUND_PENDING,
          failureReason: 'APPOINTMENT_CANCELLED_BY_USER',
        });
      }

      return {
        id: appointment.id,
        status: AppointmentStatus.CANCELLED,
        refundStatus: paid?.providerPaymentId ? 'PENDING' : null,
      };
    });
  }

  async prescriptionLink(
    userId: string,
    appointmentId: string,
    now = new Date(),
  ) {
    const appointment = await this.findOwnedAppointment(userId, appointmentId);
    if (this.effectiveStatus(appointment, now) !== AppointmentStatus.COMPLETED)
      throw new ConflictException(
        'Prescription is only available after completion',
      );
    const prescription = await this.prescriptionRepository.findForAppointment(
      userId,
      appointmentId,
    );
    const filePath = prescription
      ? this.getPrivateFilePath(prescription.storageKey)
      : null;
    if (!prescription || !filePath)
      return { available: false, downloadUrl: null, expiresAt: null };

    const expiresAt =
      Math.floor(now.getTime() / 1000) + PRESCRIPTION_LINK_TTL_SECONDS;
    const signature = this.signDownloadTicket(userId, appointmentId, expiresAt);
    return {
      available: true,
      downloadUrl: `/appointments/${appointmentId}/prescription/download?expiresAt=${expiresAt}&signature=${signature}`,
      expiresAt: new Date(expiresAt * 1000).toISOString(),
    };
  }

  async prescriptionFile(
    userId: string,
    appointmentId: string,
    expiresAt: number,
    signature: string,
    now = new Date(),
  ): Promise<string> {
    if (
      !Number.isInteger(expiresAt) ||
      expiresAt <= Math.floor(now.getTime() / 1000)
    )
      throw new GoneException('Prescription download link expired');
    const expectedSignature = this.signDownloadTicket(
      userId,
      appointmentId,
      expiresAt,
    );
    const expected = Buffer.from(expectedSignature, 'hex');
    const received = Buffer.from(signature, 'hex');
    if (
      received.length !== expected.length ||
      !timingSafeEqual(received, expected)
    )
      throw new NotFoundException('Prescription not found');

    const prescription = await this.prescriptionRepository.findForAppointment(
      userId,
      appointmentId,
    );
    if (!prescription) throw new NotFoundException('Prescription not found');
    const path = this.getPrivateFilePath(prescription.storageKey);
    if (!path) throw new NotFoundException('Prescription file is unavailable');
    return path;
  }

  async issuePrescription(
    appointmentId: string,
    storageKey: string,
    now: Date = new Date(),
  ): Promise<Prescription> {
    if (!/^[a-zA-Z0-9_-]+$/.test(storageKey))
      throw new ConflictException('Invalid private prescription storage key');
    if (!this.getPrivateFilePath(storageKey))
      throw new NotFoundException('Private prescription file not found');

    return this.unitOfWork.execute(async (repos) => {
      // No owner scope: this path is internal and carries no patient, so the
      // appointment's own userId is what the prescription is filed under.
      const appointment =
        await repos.appointments.findByIdForUpdate(appointmentId);
      if (!appointment) throw new NotFoundException('Appointment not found');
      if (
        this.effectiveStatus(appointment, now) !== AppointmentStatus.COMPLETED
      )
        throw new ConflictException(
          'Prescription is only allowed for completed appointments',
        );

      if (await repos.prescriptions.existsForAppointment(appointmentId))
        throw new ConflictException('A prescription has already been issued');

      const prescription = await repos.prescriptions.issue(
        appointmentId,
        appointment.userId,
        storageKey,
      );
      await repos.appendEvent(PRESCRIPTION_ISSUED_EVENT, {
        userId: appointment.userId,
        appointmentId,
        prescriptionId: prescription.id,
        issuedAt: now.toISOString(),
      });
      return prescription;
    });
  }

  private async findOwnedAppointment(
    userId: string,
    appointmentId: string,
  ): Promise<AppointmentRecord> {
    const appointment = await this.appointmentRepository.findByIdForUser(
      appointmentId,
      userId,
    );
    if (!appointment) throw new NotFoundException('Appointment not found');
    return appointment;
  }

  /**
   * How an appointment should read right now. A SCHEDULED appointment whose
   * time has passed displays as completed: nothing sweeps the stored status, so
   * reporting it as still scheduled would offer a Cancel action on a visit that
   * already happened. Must stay in step with the `completed` tab filter in
   * TypeOrmAppointmentRepository, which selects rows on the same rule.
   */
  private effectiveStatus(
    appointment: { status: AppointmentStatus; scheduledAt: Date },
    now: Date,
  ): AppointmentStatus {
    if (
      appointment.status === AppointmentStatus.SCHEDULED &&
      appointment.scheduledAt <= now
    )
      return AppointmentStatus.COMPLETED;
    return appointment.status;
  }

  private actionsFor(
    status: AppointmentStatus,
    prescriptionAvailable: boolean,
    rebookAvailable: boolean,
  ): AppointmentAction[] {
    if (status === AppointmentStatus.SCHEDULED)
      return [
        { type: 'CANCEL', enabled: true },
        { type: 'RESCHEDULE', enabled: true },
      ];
    if (status === AppointmentStatus.COMPLETED)
      return [
        {
          type: 'DOWNLOAD_PRESCRIPTION',
          enabled: prescriptionAvailable,
        },
      ];
    return [{ type: 'RE_BOOK', enabled: rebookAvailable }];
  }

  private encodeCursor(scheduledAt: Date, id: string): string {
    return Buffer.from(
      JSON.stringify({ scheduledAt: scheduledAt.toISOString(), id }),
    ).toString('base64url');
  }

  private decodeCursor(cursor: string): { scheduledAt: Date; id: string } {
    try {
      const value = JSON.parse(Buffer.from(cursor, 'base64url').toString()) as {
        scheduledAt?: unknown;
        id?: unknown;
      };
      const scheduledAt = new Date(String(value.scheduledAt));
      if (
        !Number.isFinite(scheduledAt.getTime()) ||
        typeof value.id !== 'string' ||
        !UUID_PATTERN.test(value.id)
      )
        throw new Error('Invalid cursor');
      return { scheduledAt, id: value.id };
    } catch {
      throw new ConflictException('Invalid appointment history cursor');
    }
  }

  private signDownloadTicket(
    userId: string,
    appointmentId: string,
    expiresAt: number,
  ): string {
    const secret = this.configService.getOrThrow<string>('JWT_ACCESS_SECRET');
    return createHmac('sha256', secret)
      .update(`${userId}:${appointmentId}:${expiresAt}`)
      .digest('hex');
  }

  private getPrivateFilePath(storageKey: string): string | null {
    const directory = resolve(
      process.env.PRESCRIPTION_STORAGE_DIR ?? 'private-prescriptions',
    );
    if (!/^[a-zA-Z0-9_-]+$/.test(storageKey)) return null;
    const path = resolve(directory, storageKey);
    try {
      const realDirectory = realpathSync(directory);
      const realPath = realpathSync(path);
      if (!realPath.startsWith(`${realDirectory}${sep}`)) return null;
      return existsSync(realPath) && statSync(realPath).isFile()
        ? realPath
        : null;
    } catch {
      return null;
    }
  }
}
