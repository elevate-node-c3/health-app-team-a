import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { AppointmentStatus } from 'src/appointment/domain/enums/appointment-status.enum';
import {
  AppointmentCard,
  AppointmentRepository,
  BookedInstant,
} from 'src/appointment/domain/repositories/appointment.repository';
import { AppointmentOrmEntity } from 'src/appointment/infrastructure/entities/typeorm/appointment.entity';
import { Between, MoreThan, Repository } from 'typeorm';

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

  async findBookedInstants(
    doctorId: string,
    clinicId: string,
    from: Date,
    to: Date,
  ): Promise<BookedInstant[]> {
    // Only the two columns the slot grid needs — no patient identity is loaded,
    // because this feeds a public endpoint. Uses
    // IDX_appointments_doctor_clinic_scheduled.
    return this.appointmentRepo
      .createQueryBuilder('appointment')
      .select('appointment.scheduledAt', 'scheduledAt')
      .addSelect('appointment.durationMinutes', 'durationMinutes')
      .where('appointment.doctorId = :doctorId', { doctorId })
      .andWhere('appointment.clinicId = :clinicId', { clinicId })
      .andWhere('appointment.status = :status', {
        status: AppointmentStatus.SCHEDULED,
      })
      .andWhere('appointment.scheduledAt >= :from', { from })
      .andWhere('appointment.scheduledAt < :to', { to })
      .orderBy('appointment.scheduledAt', 'ASC')
      .getRawMany<BookedInstant>();
  }

  private toCard(appointment: AppointmentOrmEntity): AppointmentCard {
    return {
      id: appointment.id,
      scheduledAt: appointment.scheduledAt,
      doctorId: appointment.doctor.id,
      doctorName: appointment.doctor.name,
      doctorPhoto: appointment.doctor.photo,
      specialtyName: appointment.doctor.specialty.name,
      clinicName: appointment.clinic?.name ?? null,
    };
  }
}
