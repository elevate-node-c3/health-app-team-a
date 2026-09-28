import { createHmac, timingSafeEqual } from 'crypto';
import { existsSync, realpathSync, statSync } from 'fs';
import { resolve, sep } from 'path';

import {
  ConflictException,
  GoneException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppointmentStatus } from 'src/appointment/domain/enums/appointment-status.enum';
import { OutboxEventOrmEntity } from 'src/infrastructure/database/entities/outbox-event.entity';
import { DataSource, In, SelectQueryBuilder } from 'typeorm';

import { PRESCRIPTION_ISSUED_EVENT } from './appointment-history.events';
import { AppointmentHistoryQueryDto } from './dto/appointment-history-query.dto';
import { AppointmentPrescriptionOrmEntity } from './infrastructure/entities/typeorm/appointment-prescription.entity';
import { AppointmentOrmEntity } from './infrastructure/entities/typeorm/appointment.entity';

import type { AppointmentHistoryTab } from './dto/appointment-history-query.dto';

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
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
  ) {}

  async list(
    userId: string,
    query: AppointmentHistoryQueryDto,
    now: Date = new Date(),
  ) {
    const limit = query.limit ?? 20;
    const cursor = query.cursor ? this.decodeCursor(query.cursor) : null;
    const appointments = this.dataSource
      .getRepository(AppointmentOrmEntity)
      .createQueryBuilder('appointment')
      .leftJoinAndSelect('appointment.doctor', 'doctor')
      .leftJoinAndSelect('doctor.specialty', 'specialty')
      .leftJoinAndSelect('appointment.clinic', 'clinic')
      .where('appointment.userId = :userId', { userId });

    this.applyTabFilter(appointments, query.tab ?? 'all', now);
    if (cursor) {
      appointments.andWhere(
        '(appointment.scheduledAt < :cursorAt OR (appointment.scheduledAt = :cursorAt AND appointment.id < :cursorId))',
        { cursorAt: cursor.scheduledAt, cursorId: cursor.id },
      );
    }

    const rows = await appointments
      .orderBy('appointment.scheduledAt', 'DESC')
      .addOrderBy('appointment.id', 'DESC')
      .take(limit + 1)
      .getMany();
    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit);
    const prescriptions = page.length
      ? await this.dataSource
          .getRepository(AppointmentPrescriptionOrmEntity)
          .find({
            where: { userId, appointmentId: In(page.map(({ id }) => id)) },
          })
      : [];
    const prescriptionByAppointment = new Map(
      prescriptions.map((prescription) => [
        prescription.appointmentId,
        prescription,
      ]),
    );

    const items = page.map((appointment) => {
      const status = this.effectiveStatus(appointment, now);
      const prescription = prescriptionByAppointment.get(appointment.id);
      const prescriptionAvailable =
        status === AppointmentStatus.COMPLETED &&
        Boolean(
          prescription && this.getPrivateFilePath(prescription.storageKey),
        );
      return {
        id: appointment.id,
        scheduledAt: appointment.scheduledAt,
        doctor: {
          id: appointment.doctorId,
          name:
            appointment.doctorNameSnapshot ??
            appointment.doctor?.name ??
            'Doctor',
          photo:
            appointment.doctorPhotoSnapshot ??
            appointment.doctor?.photo ??
            null,
          specialty:
            appointment.specialtyNameSnapshot ??
            appointment.doctor?.specialty.name ??
            'Specialty unavailable',
        },
        clinic: {
          id: appointment.clinicId,
          name:
            appointment.clinicNameSnapshot ?? appointment.clinic?.name ?? null,
          area:
            appointment.clinicAreaSnapshot ??
            (appointment.clinic
              ? [appointment.clinic.city, appointment.clinic.governorate]
                  .filter(Boolean)
                  .join(', ')
              : null),
        },
        status,
        prescriptionAvailable,
        actions: this.actionsFor(
          status,
          prescriptionAvailable,
          Boolean(
            appointment.doctorId &&
            appointment.clinicId &&
            appointment.doctor?.isVerified &&
            appointment.clinic?.isActive,
          ),
        ),
      };
    });

    const last = page.at(-1);
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
  ): Promise<{ id: string; status: AppointmentStatus }> {
    return this.dataSource.transaction(async (manager) => {
      const appointment = await manager
        .getRepository(AppointmentOrmEntity)
        .findOne({
          where: { id: appointmentId, userId },
          lock: { mode: 'pessimistic_write' },
        });
      if (!appointment) throw new NotFoundException('Appointment not found');
      if (
        appointment.status !== AppointmentStatus.SCHEDULED ||
        appointment.scheduledAt <= now
      )
        throw new ConflictException('This appointment cannot be cancelled');

      appointment.status = AppointmentStatus.CANCELLED;
      await manager.save(appointment);
      return { id: appointment.id, status: appointment.status };
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
    const prescription = await this.dataSource
      .getRepository(AppointmentPrescriptionOrmEntity)
      .findOneBy({ userId, appointmentId });
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

    const prescription = await this.dataSource
      .getRepository(AppointmentPrescriptionOrmEntity)
      .findOneBy({ userId, appointmentId });
    if (!prescription) throw new NotFoundException('Prescription not found');
    const path = this.getPrivateFilePath(prescription.storageKey);
    if (!path) throw new NotFoundException('Prescription file is unavailable');
    return path;
  }

  async issuePrescription(
    appointmentId: string,
    storageKey: string,
    now: Date = new Date(),
  ): Promise<AppointmentPrescriptionOrmEntity> {
    if (!/^[a-zA-Z0-9_-]+$/.test(storageKey))
      throw new ConflictException('Invalid private prescription storage key');
    if (!this.getPrivateFilePath(storageKey))
      throw new NotFoundException('Private prescription file not found');

    return this.dataSource.transaction(async (manager) => {
      const appointment = await manager
        .getRepository(AppointmentOrmEntity)
        .findOne({
          where: { id: appointmentId },
          lock: { mode: 'pessimistic_write' },
        });
      if (!appointment) throw new NotFoundException('Appointment not found');
      if (
        this.effectiveStatus(appointment, now) !== AppointmentStatus.COMPLETED
      )
        throw new ConflictException(
          'Prescription is only allowed for completed appointments',
        );

      const prescriptions = manager.getRepository(
        AppointmentPrescriptionOrmEntity,
      );
      if (await prescriptions.existsBy({ appointmentId }))
        throw new ConflictException('A prescription has already been issued');
      const prescription = await prescriptions.save(
        prescriptions.create({
          appointmentId,
          userId: appointment.userId,
          storageKey,
        }),
      );
      await manager.getRepository(OutboxEventOrmEntity).save(
        manager.create(OutboxEventOrmEntity, {
          eventName: PRESCRIPTION_ISSUED_EVENT,
          payload: {
            userId: appointment.userId,
            appointmentId,
            prescriptionId: prescription.id,
            issuedAt: now.toISOString(),
          },
        }),
      );
      return prescription;
    });
  }

  private async findOwnedAppointment(
    userId: string,
    appointmentId: string,
  ): Promise<AppointmentOrmEntity> {
    const appointment = await this.dataSource
      .getRepository(AppointmentOrmEntity)
      .findOneBy({ id: appointmentId, userId });
    if (!appointment) throw new NotFoundException('Appointment not found');
    return appointment;
  }

  private applyTabFilter(
    query: SelectQueryBuilder<AppointmentOrmEntity>,
    tab: AppointmentHistoryTab,
    now: Date,
  ): void {
    if (tab === 'upcoming') {
      query.andWhere('appointment.status = :scheduled', {
        scheduled: AppointmentStatus.SCHEDULED,
      });
      query.andWhere('appointment.scheduledAt > :now', { now });
    } else if (tab === 'completed') {
      query.andWhere(
        '(appointment.status = :completed OR (appointment.status = :scheduled AND appointment.scheduledAt <= :now))',
        {
          completed: AppointmentStatus.COMPLETED,
          scheduled: AppointmentStatus.SCHEDULED,
          now,
        },
      );
    } else if (tab === 'cancelled') {
      query.andWhere('appointment.status = :cancelled', {
        cancelled: AppointmentStatus.CANCELLED,
      });
    }
  }

  private effectiveStatus(
    appointment: AppointmentOrmEntity,
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
