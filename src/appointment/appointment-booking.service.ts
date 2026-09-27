import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AppointmentStatus } from 'src/appointment/domain/enums/appointment-status.enum';
import { BookingHoldStatus } from 'src/appointment/domain/enums/booking-hold-status.enum';
import { CreateBookingHoldDto } from 'src/appointment/dto/create-booking-hold.dto';
import { AppointmentOrmEntity } from 'src/appointment/infrastructure/entities/typeorm/appointment.entity';
import { BookingHoldOrmEntity } from 'src/appointment/infrastructure/entities/typeorm/booking-hold.entity';
import { DoctorClinicOrmEntity } from 'src/doctor/infrastructure/entities/typeorm/doctor-clinic.entity';
import { DataSource, EntityManager } from 'typeorm';

const HOLD_TTL_MS = 10 * 60 * 1000;
const APPOINTMENT_DURATION_MS = 30 * 60 * 1000;

@Injectable()
export class AppointmentBookingService {
  constructor(private readonly dataSource: DataSource) {}

  async createHold(
    userId: string,
    dto: CreateBookingHoldDto,
    now: Date = new Date(),
  ): Promise<BookingHoldOrmEntity> {
    const scheduledAt = new Date(dto.scheduledAt);
    if (!Number.isFinite(scheduledAt.getTime()) || scheduledAt <= now)
      throw new BadRequestException('Choose a future appointment time');

    return this.dataSource.transaction(async (manager) => {
      await this.lockDoctor(manager, dto.doctorId);
      const pairing = await this.findActivePairing(
        manager,
        dto.doctorId,
        dto.clinicId,
      );
      if (!pairing) throw new NotFoundException('Doctor or clinic unavailable');

      await this.assertSlotAvailable(manager, dto.doctorId, scheduledAt, now);

      const hold = manager.create(BookingHoldOrmEntity, {
        userId,
        doctorId: dto.doctorId,
        clinicId: dto.clinicId,
        scheduledAt,
        frozenAmount: pairing.fee.toFixed(2),
        expiresAt: new Date(now.getTime() + HOLD_TTL_MS),
        status: BookingHoldStatus.HELD,
      });
      return manager.save(hold);
    });
  }

  async claimHold(
    manager: EntityManager,
    userId: string,
    holdId: string,
    now: Date,
  ): Promise<BookingHoldOrmEntity> {
    const hold = await manager.getRepository(BookingHoldOrmEntity).findOne({
      where: { id: holdId, userId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!hold) throw new NotFoundException('Booking hold not found');
    if (hold.status !== BookingHoldStatus.HELD)
      throw new ConflictException('This booking hold is no longer payable');
    if (hold.expiresAt <= now) {
      hold.status = BookingHoldStatus.EXPIRED;
      await manager.save(hold);
      throw new ConflictException({
        code: 'BOOKING_HOLD_EXPIRED',
        message: 'Your time hold expired. Choose an appointment time again.',
        action: 'CHOOSE_TIME_AGAIN',
      });
    }

    await this.findActivePairing(manager, hold.doctorId, hold.clinicId).then(
      (pairing) => {
        if (!pairing)
          throw new ConflictException({
            code: 'DOCTOR_UNAVAILABLE',
            message: 'This doctor or clinic is no longer available.',
            action: 'CHOOSE_ANOTHER_TIME',
          });
      },
    );

    hold.status = BookingHoldStatus.PAYMENT_PENDING;
    return manager.save(hold);
  }

  async bookClaimedHold(
    manager: EntityManager,
    holdId: string,
  ): Promise<{
    appointment: AppointmentOrmEntity;
    doctorName: string;
    clinicName: string;
  }> {
    const hold = await manager.getRepository(BookingHoldOrmEntity).findOne({
      where: { id: holdId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!hold || hold.status !== BookingHoldStatus.PAYMENT_PENDING)
      throw new ConflictException('The booking hold is not awaiting payment');

    await this.lockDoctor(manager, hold.doctorId);
    await this.assertNoAppointmentOverlap(
      manager,
      hold.doctorId,
      hold.scheduledAt,
    );
    const pairing = await this.findActivePairing(
      manager,
      hold.doctorId,
      hold.clinicId,
    );
    if (!pairing) throw new ConflictException('Doctor or clinic unavailable');

    const appointment = manager.create(AppointmentOrmEntity, {
      userId: hold.userId,
      doctorId: hold.doctorId,
      clinicId: hold.clinicId,
      scheduledAt: hold.scheduledAt,
      status: AppointmentStatus.SCHEDULED,
    });
    const savedAppointment = await manager.save(appointment);
    hold.status = BookingHoldStatus.BOOKED;
    await manager.save(hold);

    return {
      appointment: savedAppointment,
      doctorName: pairing.doctor.name,
      clinicName: pairing.clinic.name,
    };
  }

  async releaseHold(manager: EntityManager, holdId: string): Promise<void> {
    const hold = await manager.getRepository(BookingHoldOrmEntity).findOne({
      where: { id: holdId },
      lock: { mode: 'pessimistic_write' },
    });
    if (hold && hold.status === BookingHoldStatus.PAYMENT_PENDING) {
      hold.status = BookingHoldStatus.RELEASED;
      await manager.save(hold);
    }
  }

  private async findActivePairing(
    manager: EntityManager,
    doctorId: string,
    clinicId: string,
  ): Promise<DoctorClinicOrmEntity | null> {
    return manager.getRepository(DoctorClinicOrmEntity).findOne({
      where: {
        doctorId,
        clinicId,
        isActive: true,
        doctor: { isVerified: true },
        clinic: { isActive: true },
      },
      relations: { doctor: true, clinic: true },
    });
  }

  private async assertSlotAvailable(
    manager: EntityManager,
    doctorId: string,
    scheduledAt: Date,
    now: Date,
  ): Promise<void> {
    const end = new Date(scheduledAt.getTime() + APPOINTMENT_DURATION_MS);
    const start = new Date(scheduledAt.getTime() - APPOINTMENT_DURATION_MS);
    const booked = await manager
      .getRepository(AppointmentOrmEntity)
      .createQueryBuilder('appointment')
      .where('appointment.doctorId = :doctorId', { doctorId })
      .andWhere('appointment.status = :status', {
        status: AppointmentStatus.SCHEDULED,
      })
      .andWhere(
        'appointment.scheduledAt > :start AND appointment.scheduledAt < :end',
        {
          start,
          end,
        },
      )
      .getExists();
    if (booked) throw new ConflictException('This appointment time is taken');

    const held = await manager
      .getRepository(BookingHoldOrmEntity)
      .createQueryBuilder('hold')
      .where('hold.doctorId = :doctorId', { doctorId })
      .andWhere(
        '(hold.status = :pending OR (hold.status = :held AND hold.expiresAt > :now))',
        {
          pending: BookingHoldStatus.PAYMENT_PENDING,
          held: BookingHoldStatus.HELD,
          now,
        },
      )
      .andWhere('hold.scheduledAt > :start AND hold.scheduledAt < :end', {
        start,
        end,
      })
      .getExists();
    if (held) throw new ConflictException('This appointment time is held');
  }

  private async assertNoAppointmentOverlap(
    manager: EntityManager,
    doctorId: string,
    scheduledAt: Date,
  ): Promise<void> {
    const start = new Date(scheduledAt.getTime() - APPOINTMENT_DURATION_MS);
    const end = new Date(scheduledAt.getTime() + APPOINTMENT_DURATION_MS);
    const overlap = await manager
      .getRepository(AppointmentOrmEntity)
      .createQueryBuilder('appointment')
      .where('appointment.doctorId = :doctorId', { doctorId })
      .andWhere('appointment.status = :status', {
        status: AppointmentStatus.SCHEDULED,
      })
      .andWhere(
        'appointment.scheduledAt > :start AND appointment.scheduledAt < :end',
        {
          start,
          end,
        },
      )
      .getExists();
    if (overlap) throw new ConflictException('This appointment time is taken');
  }

  private async lockDoctor(
    manager: EntityManager,
    doctorId: string,
  ): Promise<void> {
    await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
      `appointment-doctor:${doctorId}`,
    ]);
  }
}
