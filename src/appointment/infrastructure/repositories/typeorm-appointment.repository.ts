import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { AppointmentStatus } from 'src/appointment/domain/enums/appointment-status.enum';
import {
  AppointmentCard,
  AppointmentRepository,
  BookedInstant,
} from 'src/appointment/domain/repositories/appointment.repository';
import { AppointmentOrmEntity } from 'src/appointment/infrastructure/entities/typeorm/appointment.entity';
import {
  And,
  Between,
  LessThan,
  MoreThan,
  MoreThanOrEqual,
  Repository,
} from 'typeorm';

const CARD_RELATIONS = {
  doctor: { specialty: true },
  clinic: true,
} as const;

@Injectable()
export class TypeOrmAppointmentRepository implements AppointmentRepository {
  constructor(
    @InjectRepository(AppointmentOrmEntity)
    private readonly appointmentRepo: Repository<AppointmentOrmEntity>,
  ) {}

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
        appointment.doctor?.specialty.name ??
        'Specialty unavailable',
      clinicName:
        appointment.clinicNameSnapshot ?? appointment.clinic?.name ?? null,
    };
  }
}
