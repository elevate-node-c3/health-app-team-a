import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { AppointmentStatus } from 'src/appointment/domain/enums/appointment-status.enum';
import { AppointmentOrmEntity } from 'src/appointment/infrastructure/entities/typeorm/appointment.entity';
import { DoctorClinicScheduleOrmEntity } from 'src/doctor/infrastructure/entities/typeorm/doctor-clinic-schedule.entity';
import { DoctorClinicOrmEntity } from 'src/doctor/infrastructure/entities/typeorm/doctor-clinic.entity';
import {
  HOLD_DURATION_MINUTES,
  HOLD_EXTENSION_MINUTES,
  SLOT_DURATION_MINUTES,
  SlotHold,
} from 'src/slot-hold/domain/entities/slot-hold.model';
import { SlotHoldStatus } from 'src/slot-hold/domain/enums/slot-hold-status.enum';
import { SlotHoldOrmEntity } from 'src/slot-hold/infrastructure/entities/typeorm/slot-hold.entity';
import { SlotHoldMapper } from 'src/slot-hold/infrastructure/mappers/slot-hold.mapper';
import { QueryFailedError, Repository } from 'typeorm';

import type {
  AcquireResult,
  AcquireSlotHoldInput,
  SlotHoldRepository,
} from 'src/slot-hold/domain/repositories/slot-hold.repository';

const ACTIVE_SLOT_INDEX = 'IDX_slot_holds_active_slot';
const CAIRO_TIME = `(CAST(:scheduledAt AS timestamptz) AT TIME ZONE 'Africa/Cairo')`;

@Injectable()
export class TypeOrmSlotHoldRepository implements SlotHoldRepository {
  constructor(
    @InjectRepository(SlotHoldOrmEntity)
    private readonly repo: Repository<SlotHoldOrmEntity>,
    @InjectRepository(AppointmentOrmEntity)
    private readonly appointmentRepo: Repository<AppointmentOrmEntity>,
    @InjectRepository(DoctorClinicOrmEntity)
    private readonly doctorClinicRepo: Repository<DoctorClinicOrmEntity>,
  ) {}

  async findFeeForSlot(
    doctorId: string,
    clinicId: string,
    scheduledAt: Date,
  ): Promise<number | null> {
    const doctorClinic = await this.doctorClinicRepo
      .createQueryBuilder('dc')
      .innerJoin(
        DoctorClinicScheduleOrmEntity,
        'schedule',
        'schedule.doctorClinicId = dc.id',
      )
      .where('dc.doctorId = :doctorId', { doctorId })
      .andWhere('dc.clinicId = :clinicId', { clinicId })
      .andWhere('dc.isActive = true')
      .andWhere(`schedule.dayOfWeek = EXTRACT(DOW FROM ${CAIRO_TIME})`)
      .andWhere(`schedule.startTime <= CAST(${CAIRO_TIME} AS time)`)
      .andWhere(
        `CAST(${CAIRO_TIME} AS time) <= schedule.endTime - interval '${SLOT_DURATION_MINUTES} minutes'`,
      )
      .setParameter('scheduledAt', scheduledAt)
      .getOne();

    return doctorClinic ? Number(doctorClinic.fee) : null;
  }

  async acquire(input: AcquireSlotHoldInput): Promise<AcquireResult> {
    const { userId, doctorId, clinicId, scheduledAt } = input;

    const booking = await this.appointmentRepo.findOne({
      where: {
        doctorId,
        clinicId,
        scheduledAt,
        status: AppointmentStatus.SCHEDULED,
      },
    });
    if (booking)
      return {
        outcome: 'already_booked',
        mine: booking.userId === userId,
        expiredBySweep: [],
      };

    const hold = await this.tryInsert(input);
    if (hold) return { outcome: 'held', hold, expiredBySweep: [] };

    const expiredBySweep = await this.expireDeadHold(input);
    if (expiredBySweep.length > 0) {
      const retried = await this.tryInsert(input);
      if (retried) return { outcome: 'held', hold: retried, expiredBySweep };
    }

    const blocker = await this.findLiveHold(input);
    if (blocker?.isHeldBy(userId))
      return { outcome: 'held_by_caller', hold: blocker, expiredBySweep };

    return { outcome: 'slot_taken', expiredBySweep };
  }

  async findByIdForUser(id: string, userId: string): Promise<SlotHold | null> {
    const row = await this.repo.findOne({ where: { id, userId } });
    return row ? SlotHoldMapper.toDomain(row) : null;
  }

  async extend(id: string, userId: string): Promise<SlotHold | null> {
    const result = await this.repo
      .createQueryBuilder()
      .update(SlotHoldOrmEntity)
      .set({
        expiresAt: () =>
          `"expiresAt" + interval '${HOLD_EXTENSION_MINUTES} minutes'`,
        extended: true,
      })
      .where('id = :id', { id })
      .andWhere('"userId" = :userId', { userId })
      .andWhere('status = :status', { status: SlotHoldStatus.ACTIVE })
      .andWhere('extended = false')
      .andWhere('"expiresAt" > now()')
      .returning('*')
      .execute();

    return this.firstRow(result.raw);
  }

  async release(id: string, userId: string): Promise<SlotHold | null> {
    const result = await this.repo
      .createQueryBuilder()
      .update(SlotHoldOrmEntity)
      .set({ status: SlotHoldStatus.RELEASED })
      .where('id = :id', { id })
      .andWhere('"userId" = :userId', { userId })
      .andWhere('status = :status', { status: SlotHoldStatus.ACTIVE })
      .andWhere('"expiresAt" > now()')
      .returning('*')
      .execute();

    return this.firstRow(result.raw);
  }

  async sweepExpired(limit: number): Promise<SlotHold[]> {
    const result = await this.repo
      .createQueryBuilder()
      .update(SlotHoldOrmEntity)
      .set({ status: SlotHoldStatus.EXPIRED })
      .where(
        `id IN (SELECT id FROM slot_holds WHERE status = :active AND "expiresAt" <= now() ORDER BY "expiresAt" LIMIT :limit FOR UPDATE SKIP LOCKED)`,
        { active: SlotHoldStatus.ACTIVE, limit },
      )
      .returning('*')
      .execute();

    return this.allRows(result.raw);
  }

  private async tryInsert(
    input: AcquireSlotHoldInput,
  ): Promise<SlotHold | null> {
    try {
      const result = await this.repo
        .createQueryBuilder()
        .insert()
        .into(SlotHoldOrmEntity)
        .values({
          ...input,
          status: SlotHoldStatus.ACTIVE,
          expiresAt: () =>
            `now() + interval '${HOLD_DURATION_MINUTES} minutes'`,
          extended: false,
        })
        .returning('*')
        .execute();

      return this.firstRow(result.raw);
    } catch (error) {
      if (this.isActiveSlotConflict(error)) return null;
      throw error;
    }
  }

  private async expireDeadHold(
    input: AcquireSlotHoldInput,
  ): Promise<SlotHold[]> {
    const result = await this.repo
      .createQueryBuilder()
      .update(SlotHoldOrmEntity)
      .set({ status: SlotHoldStatus.EXPIRED })
      .where('"doctorId" = :doctorId', { doctorId: input.doctorId })
      .andWhere('"clinicId" = :clinicId', { clinicId: input.clinicId })
      .andWhere('"scheduledAt" = :scheduledAt', {
        scheduledAt: input.scheduledAt,
      })
      .andWhere('status = :status', { status: SlotHoldStatus.ACTIVE })
      .andWhere('"expiresAt" <= now()')
      .returning('*')
      .execute();

    return this.allRows(result.raw);
  }

  private async findLiveHold(
    input: AcquireSlotHoldInput,
  ): Promise<SlotHold | null> {
    const row = await this.repo
      .createQueryBuilder('hold')
      .where('hold.doctorId = :doctorId', { doctorId: input.doctorId })
      .andWhere('hold.clinicId = :clinicId', { clinicId: input.clinicId })
      .andWhere('hold.scheduledAt = :scheduledAt', {
        scheduledAt: input.scheduledAt,
      })
      .andWhere('hold.status = :status', { status: SlotHoldStatus.ACTIVE })
      .andWhere('hold.expiresAt > now()')
      .getOne();

    return row ? SlotHoldMapper.toDomain(row) : null;
  }

  private isActiveSlotConflict(error: unknown): boolean {
    if (!(error instanceof QueryFailedError)) return false;
    const driverError = error.driverError as {
      code?: string;
      constraint?: string;
    };
    return (
      driverError.code === '23505' &&
      driverError.constraint === ACTIVE_SLOT_INDEX
    );
  }

  private firstRow(raw: unknown): SlotHold | null {
    return this.allRows(raw)[0] ?? null;
  }

  private allRows(raw: unknown): SlotHold[] {
    return (raw as SlotHoldOrmEntity[]).map((row) =>
      SlotHoldMapper.toDomain(row),
    );
  }
}
