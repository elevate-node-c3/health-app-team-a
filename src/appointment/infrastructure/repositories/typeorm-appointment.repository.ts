import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { AppointmentStatus } from 'src/appointment/domain/enums/appointment-status.enum';
import {
  AppointmentCard,
  AppointmentHistoryPage,
  AppointmentHistoryRow,
  AppointmentReceipt,
  AppointmentRecord,
  AppointmentReminder,
  AppointmentRepository,
  BookedInstant,
  CreateAppointmentInput,
  FindHistoryPageInput,
} from 'src/appointment/domain/repositories/appointment.repository';
import { AppointmentPrescriptionOrmEntity } from 'src/appointment/infrastructure/entities/typeorm/appointment-prescription.entity';
import { AppointmentOrmEntity } from 'src/appointment/infrastructure/entities/typeorm/appointment.entity';
import {
  And,
  Between,
  LessThan,
  MoreThan,
  MoreThanOrEqual,
  Repository,
  type SelectQueryBuilder,
} from 'typeorm';

import type { AppointmentHistoryTab } from 'src/appointment/dto/appointment-history-query.dto';

const CARD_RELATIONS = {
  doctor: { specialty: true },
  clinic: true,
} as const;

/** The subset of the row the booking and cancellation paths need. */
function toRecord(row: AppointmentOrmEntity): AppointmentRecord {
  return {
    id: row.id,
    userId: row.userId,
    doctorId: row.doctorId,
    clinicId: row.clinicId,
    scheduledAt: row.scheduledAt,
    status: row.status,
  };
}

/**
 * The two columns the history page reads outside the entity graph. At most one
 * prescription exists per appointment (`IDX_appointment_prescriptions_appointment`
 * is unique), so the left join cannot multiply rows.
 */
interface HistoryRawRow {
  appointment_id: string;
  prescriptionStorageKey: string | null;
}

/**
 * Narrows the page to one tab.
 *
 * `completed` deliberately also matches a SCHEDULED appointment whose time has
 * passed: nothing sweeps those to COMPLETED, so the tab would otherwise lose
 * them until some later job ran. The same rule is applied again when deriving
 * each row's display status, and the two must agree or a row could appear under
 * a tab while reading as another status.
 */
function applyTabFilter(
  query: SelectQueryBuilder<AppointmentOrmEntity>,
  tab: AppointmentHistoryTab,
  now: Date,
): void {
  if (tab === 'upcoming') {
    query
      .andWhere('appointment.status = :scheduled', {
        scheduled: AppointmentStatus.SCHEDULED,
      })
      .andWhere('appointment.scheduledAt > :now', { now });
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

@Injectable()
export class TypeOrmAppointmentRepository implements AppointmentRepository {
  constructor(
    @InjectRepository(AppointmentOrmEntity)
    private readonly appointmentRepo: Repository<AppointmentOrmEntity>,
  ) {}

  /**
   * QueryBuilder rather than find-options for two reasons the repository API
   * cannot cover: the keyset predicate is a compound OR over two columns, and
   * the prescription join is a left join to a different entity whose only
   * needed column is the storage key.
   *
   * Reads `limit + 1` rows to learn whether a further page exists without a
   * second COUNT query, then trims the extra before returning.
   */
  async findHistoryPage(
    input: FindHistoryPageInput,
  ): Promise<AppointmentHistoryPage> {
    const { userId, tab, cursor, limit, now } = input;

    const query = this.appointmentRepo
      .createQueryBuilder('appointment')
      .leftJoinAndSelect('appointment.doctor', 'doctor')
      .leftJoinAndSelect('doctor.specialty', 'specialty')
      .leftJoinAndSelect('appointment.clinic', 'clinic')
      .leftJoin(
        AppointmentPrescriptionOrmEntity,
        'prescription',
        'prescription."appointmentId" = appointment.id AND prescription."userId" = appointment."userId"',
      )
      .addSelect('prescription.storageKey', 'prescriptionStorageKey')
      .where('appointment.userId = :userId', { userId });

    applyTabFilter(query, tab, now);

    if (cursor) {
      query.andWhere(
        '(appointment.scheduledAt < :cursorAt OR (appointment.scheduledAt = :cursorAt AND appointment.id < :cursorId))',
        { cursorAt: cursor.scheduledAt, cursorId: cursor.id },
      );
    }

    const { entities, raw } = await query
      .orderBy('appointment.scheduledAt', 'DESC')
      .addOrderBy('appointment.id', 'DESC')
      .take(limit + 1)
      .getRawAndEntities<HistoryRawRow>();

    const storageKeyByAppointment = new Map(
      raw.map((row) => [row.appointment_id, row.prescriptionStorageKey]),
    );

    return {
      rows: entities
        .slice(0, limit)
        .map((appointment) =>
          this.toHistoryRow(
            appointment,
            storageKeyByAppointment.get(appointment.id) ?? null,
          ),
        ),
      hasMore: entities.length > limit,
    };
  }

  async findNextUpcoming(
    userId: string,
    now: Date,
  ): Promise<AppointmentCard | null> {
    const appointment = await this.appointmentRepo.findOne({
      where: {
        userId,
        status: AppointmentStatus.SCHEDULED,
        scheduledAt: MoreThan(now),
      },
      order: { scheduledAt: 'ASC' },
      relations: CARD_RELATIONS,
    });

    return appointment ? this.toCard(appointment) : null;
  }

  async findMostRecentVisit(
    userId: string,
    now: Date,
    windowDays: number,
  ): Promise<AppointmentCard | null> {
    const windowStart = new Date(
      now.getTime() - windowDays * 24 * 60 * 60 * 1000,
    );

    const appointment = await this.appointmentRepo.findOne({
      where: {
        userId,
        status: AppointmentStatus.COMPLETED,
        scheduledAt: Between(windowStart, now),
      },
      order: { scheduledAt: 'DESC' },
      relations: CARD_RELATIONS,
    });

    return appointment ? this.toCard(appointment) : null;
  }

  async create(input: CreateAppointmentInput): Promise<AppointmentRecord> {
    const saved = await this.appointmentRepo.save(
      this.appointmentRepo.create({
        ...input,
        status: AppointmentStatus.SCHEDULED,
      }),
    );
    return toRecord(saved);
  }

  async findByIdForUser(
    id: string,
    userId: string,
  ): Promise<AppointmentRecord | null> {
    const row = await this.appointmentRepo.findOneBy({ id, userId });
    return row ? toRecord(row) : null;
  }

  async findByIdForUserForUpdate(
    id: string,
    userId: string,
  ): Promise<AppointmentRecord | null> {
    const row = await this.appointmentRepo.findOne({
      where: { id, userId },
      lock: { mode: 'pessimistic_write' },
    });
    return row ? toRecord(row) : null;
  }

  async claimDueReminders(
    dueBefore: Date,
    limit: number,
  ): Promise<AppointmentReminder[]> {
    const result = await this.appointmentRepo
      .createQueryBuilder()
      .update(AppointmentOrmEntity)
      .set({ reminderSentAt: () => 'now()' })
      .where(
        `id IN (SELECT id FROM appointments WHERE status = :scheduled AND "reminderSentAt" IS NULL AND "scheduledAt" > now() AND "scheduledAt" <= :dueBefore ORDER BY "scheduledAt" LIMIT :limit FOR UPDATE SKIP LOCKED)`,
        { scheduled: AppointmentStatus.SCHEDULED, dueBefore, limit },
      )
      .returning([
        'id',
        'userId',
        'scheduledAt',
        'doctorNameSnapshot',
        'clinicNameSnapshot',
      ])
      .execute();

    return (result.raw as AppointmentOrmEntity[]).map((row) => ({
      id: row.id,
      userId: row.userId,
      scheduledAt: row.scheduledAt,
      doctorName: row.doctorNameSnapshot ?? 'your doctor',
      clinicName: row.clinicNameSnapshot,
    }));
  }

  async findReceipt(
    id: string,
    userId: string,
  ): Promise<AppointmentReceipt | null> {
    const row = await this.appointmentRepo.findOne({
      where: { id, userId },
      relations: { doctor: true, clinic: true },
    });
    if (!row) return null;

    return {
      id: row.id,
      scheduledAt: row.scheduledAt,
      doctorName: row.doctorNameSnapshot ?? row.doctor?.name ?? 'Doctor',
      clinicName: row.clinicNameSnapshot ?? row.clinic?.name ?? null,
    };
  }

  async findByIdForUpdate(id: string): Promise<AppointmentRecord | null> {
    const row = await this.appointmentRepo.findOne({
      where: { id },
      lock: { mode: 'pessimistic_write' },
    });
    return row ? toRecord(row) : null;
  }

  async updateStatus(id: string, status: AppointmentStatus): Promise<void> {
    await this.appointmentRepo.update({ id }, { status });
  }

  existsScheduledInWindow(
    doctorId: string,
    after: Date,
    before: Date,
  ): Promise<boolean> {
    return this.appointmentRepo.existsBy({
      doctorId,
      status: AppointmentStatus.SCHEDULED,
      scheduledAt: And(MoreThan(after), LessThan(before)),
    });
  }

  async findBookedInstantsForDoctor(
    doctorId: string,
    from: Date,
    to: Date,
  ): Promise<BookedInstant[]> {
    // Only the two columns the slot grid needs — no patient identity is loaded,
    // because this feeds a public endpoint. `doctorId` leads
    // IDX_appointments_doctor_clinic_scheduled, so the index still serves this
    // even without a clinic predicate.
    return this.appointmentRepo.find({
      select: { scheduledAt: true, durationMinutes: true },
      where: {
        doctorId,
        status: AppointmentStatus.SCHEDULED,
        scheduledAt: And(MoreThanOrEqual(from), LessThan(to)),
      },
      order: { scheduledAt: 'ASC' },
    });
  }

  /**
   * Snapshot first, live relation second, placeholder last — so a card keeps
   * reading as it did when booked even after the doctor is renamed or the
   * clinic is deleted.
   */
  private toHistoryRow(
    appointment: AppointmentOrmEntity,
    prescriptionStorageKey: string | null,
  ): AppointmentHistoryRow {
    return {
      id: appointment.id,
      scheduledAt: appointment.scheduledAt,
      status: appointment.status,
      doctorId: appointment.doctorId,
      doctorName:
        appointment.doctorNameSnapshot ?? appointment.doctor?.name ?? 'Doctor',
      doctorPhoto:
        appointment.doctorPhotoSnapshot ?? appointment.doctor?.photo ?? null,
      specialtyName:
        appointment.specialtyNameSnapshot ??
        appointment.doctor?.specialty?.name ??
        'Specialty unavailable',
      clinicId: appointment.clinicId,
      clinicName:
        appointment.clinicNameSnapshot ?? appointment.clinic?.name ?? null,
      clinicArea:
        appointment.clinicAreaSnapshot ??
        (appointment.clinic
          ? [appointment.clinic.city, appointment.clinic.governorate]
              .filter(Boolean)
              .join(', ')
          : null),
      rebookable: Boolean(
        appointment.doctorId &&
        appointment.clinicId &&
        appointment.doctor?.isVerified &&
        appointment.clinic?.isActive,
      ),
      prescriptionStorageKey,
    };
  }

  private toCard(appointment: AppointmentOrmEntity): AppointmentCard {
    return {
      id: appointment.id,
      scheduledAt: appointment.scheduledAt,
      doctorId: appointment.doctor?.id ?? null,
      doctorName:
        appointment.doctorNameSnapshot ?? appointment.doctor?.name ?? 'Doctor',
      doctorPhoto:
        appointment.doctorPhotoSnapshot ?? appointment.doctor?.photo ?? null,
      specialtyName:
        appointment.specialtyNameSnapshot ??
        appointment.doctor?.specialty?.name ??
        'Specialty unavailable',
      clinicName:
        appointment.clinicNameSnapshot ?? appointment.clinic?.name ?? null,
    };
  }
}
