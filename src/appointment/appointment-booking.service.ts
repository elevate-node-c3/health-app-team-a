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
import { BOOKING_HORIZON_DAYS } from 'src/doctor/availability.constants';
import { DoctorClinicOrmEntity } from 'src/doctor/infrastructure/entities/typeorm/doctor-clinic.entity';
import { findOfferedSlot } from 'src/doctor/infrastructure/offered-slot.query';
import { And, DataSource, EntityManager, LessThan, MoreThan } from 'typeorm';

const HOLD_TTL_MS = 10 * 60 * 1000;
const APPOINTMENT_DURATION_MS = 30 * 60 * 1000;
const HORIZON_MS = BOOKING_HORIZON_DAYS * 24 * 60 * 60 * 1000;

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

      await this.assertSlotIsOffered(
        manager,
        dto.doctorId,
        dto.clinicId,
        scheduledAt,
        now,
      );
      await this.assertSlotAvailable(manager, dto.doctorId, scheduledAt, now);

      const hold = manager.create(BookingHoldOrmEntity, {
        userId,
        doctorId: dto.doctorId,
        clinicId: dto.clinicId,
        scheduledAt,
        // `fee` is a numeric column, which the pg driver hands back as a
        // string despite the entity typing it as a number — hence the cast.
        frozenAmount: Number(pairing.fee).toFixed(2),
        expiresAt: new Date(now.getTime() + HOLD_TTL_MS),
        status: BookingHoldStatus.HELD,
      });
      return manager.save(hold);
    });
  }

  async createReplacementHold(
    userId: string,
    appointmentId: string,
    scheduledAtValue: string,
    mode: 'reschedule' | 'rebook',
    now: Date = new Date(),
  ): Promise<BookingHoldOrmEntity> {
    const scheduledAt = new Date(scheduledAtValue);
    if (!Number.isFinite(scheduledAt.getTime()) || scheduledAt <= now)
      throw new BadRequestException('Choose a future appointment time');

    return this.dataSource.transaction(async (manager) => {
      const appointments = manager.getRepository(AppointmentOrmEntity);
      let source = await appointments.findOneBy({ id: appointmentId, userId });
      if (!source) throw new NotFoundException('Appointment not found');
      if (!source.doctorId || !source.clinicId)
        throw new ConflictException(
          'The original doctor or clinic is unavailable',
        );

      await this.lockDoctor(manager, source.doctorId);
      source = await appointments.findOne({
        where: { id: appointmentId, userId },
        lock: { mode: 'pessimistic_write' },
      });
      const expectedStatus =
        mode === 'reschedule'
          ? AppointmentStatus.SCHEDULED
          : AppointmentStatus.CANCELLED;
      if (!source) throw new NotFoundException('Appointment not found');
      if (
        source.status !== expectedStatus ||
        (mode === 'reschedule' && source.scheduledAt <= now)
      )
        throw new ConflictException('This appointment cannot be replaced');
      if (!source.doctorId || !source.clinicId)
        throw new ConflictException(
          'The original doctor or clinic is unavailable',
        );

      return this.createHoldInTransaction(
        manager,
        userId,
        {
          doctorId: source.doctorId,
          clinicId: source.clinicId,
          scheduledAt: scheduledAt.toISOString(),
        },
        scheduledAt,
        now,
        source.id,
      );
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

    // Record the length the appointment really runs for, from the hours it was
    // booked inside. Availability blocks the slots a booking overlaps, so
    // leaving this null would make a 20-minute booking read as 30. The hours
    // may have been edited since the hold was taken, hence the fallback.
    const offered = await findOfferedSlot(
      manager,
      hold.doctorId,
      hold.clinicId,
      hold.scheduledAt,
    );

    const appointment = manager.create(AppointmentOrmEntity, {
      userId: hold.userId,
      doctorId: hold.doctorId,
      clinicId: hold.clinicId,
      scheduledAt: hold.scheduledAt,
      status: AppointmentStatus.SCHEDULED,
      durationMinutes: offered?.slotMinutes ?? APPOINTMENT_DURATION_MS / 60_000,
      doctorNameSnapshot: pairing.doctor.name,
      doctorPhotoSnapshot: pairing.doctor.photo,
      specialtyNameSnapshot: pairing.doctor.specialty.name,
      clinicNameSnapshot: pairing.clinic.name,
      clinicAreaSnapshot: [pairing.clinic.city, pairing.clinic.governorate]
        .filter(Boolean)
        .join(', '),
    });
    const savedAppointment = await manager.save(appointment);
    if (hold.reschedulesAppointmentId) {
      const source = await manager.getRepository(AppointmentOrmEntity).findOne({
        where: { id: hold.reschedulesAppointmentId, userId: hold.userId },
        lock: { mode: 'pessimistic_write' },
      });
      if (source?.status === AppointmentStatus.SCHEDULED) {
        source.status = AppointmentStatus.CANCELLED;
        await manager.save(source);
      }
    }
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
      relations: { doctor: { specialty: true }, clinic: true },
    });
  }

  /**
   * A hold may only be taken on a time the calendar actually offered: inside
   * the doctor's posted hours for that clinic, on the slot grid, not on leave,
   * and within the booking horizon. Without this a client could hold 03:00 on
   * a leave day, or a date a year out, and `GET /doctors/:id/availability`
   * would then report a taken time it never generated.
   */
  private async assertSlotIsOffered(
    manager: EntityManager,
    doctorId: string,
    clinicId: string,
    scheduledAt: Date,
    now: Date,
  ): Promise<void> {
    if (scheduledAt.getTime() > now.getTime() + HORIZON_MS)
      throw new BadRequestException(
        `Appointments can only be booked up to ${BOOKING_HORIZON_DAYS} days ahead`,
      );

    const offered = await findOfferedSlot(
      manager,
      doctorId,
      clinicId,
      scheduledAt,
    );
    if (!offered)
      throw new BadRequestException(
        'The doctor does not see patients at that time',
      );
  }
  private async createHoldInTransaction(
    manager: EntityManager,
    userId: string,
    dto: CreateBookingHoldDto,
    scheduledAt: Date,
    now: Date,
    reschedulesAppointmentId: string | null = null,
  ): Promise<BookingHoldOrmEntity> {
    await this.lockDoctor(manager, dto.doctorId);
    const pairing = await this.findActivePairing(
      manager,
      dto.doctorId,
      dto.clinicId,
    );
    if (!pairing) throw new ConflictException('Doctor or clinic unavailable');

    await this.assertSlotAvailable(manager, dto.doctorId, scheduledAt, now);

    const hold = manager.create(BookingHoldOrmEntity, {
      userId,
      doctorId: dto.doctorId,
      clinicId: dto.clinicId,
      scheduledAt,
      frozenAmount: pairing.fee.toFixed(2),
      expiresAt: new Date(now.getTime() + HOLD_TTL_MS),
      status: BookingHoldStatus.HELD,
      reschedulesAppointmentId,
    });
    return manager.save(hold);
  }

  private async assertSlotAvailable(
    manager: EntityManager,
    doctorId: string,
    scheduledAt: Date,
    now: Date,
  ): Promise<void> {
    const window = overlapWindow(scheduledAt);

    const booked = await manager.getRepository(AppointmentOrmEntity).existsBy({
      doctorId,
      status: AppointmentStatus.SCHEDULED,
      scheduledAt: window,
    });
    if (booked) throw new ConflictException('This appointment time is taken');

    // Pending payment has no expiry — the money is in flight — while a plain
    // hold only blocks until it lapses. The two objects are OR'd.
    const held = await manager.getRepository(BookingHoldOrmEntity).exists({
      where: [
        {
          doctorId,
          status: BookingHoldStatus.PAYMENT_PENDING,
          scheduledAt: window,
        },
        {
          doctorId,
          status: BookingHoldStatus.HELD,
          expiresAt: MoreThan(now),
          scheduledAt: window,
        },
      ],
    });
    if (held) throw new ConflictException('This appointment time is held');
  }

  private async assertNoAppointmentOverlap(
    manager: EntityManager,
    doctorId: string,
    scheduledAt: Date,
  ): Promise<void> {
    const overlap = await manager.getRepository(AppointmentOrmEntity).existsBy({
      doctorId,
      status: AppointmentStatus.SCHEDULED,
      scheduledAt: overlapWindow(scheduledAt),
    });
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

/**
 * The exclusive band around an instant: anything starting inside it would run
 * into the appointment, so the doctor cannot take both. Open at both ends, so
 * a booking exactly one slot earlier or later is still allowed.
 */
function overlapWindow(scheduledAt: Date) {
  return And(
    MoreThan(new Date(scheduledAt.getTime() - APPOINTMENT_DURATION_MS)),
    LessThan(new Date(scheduledAt.getTime() + APPOINTMENT_DURATION_MS)),
  );
}
