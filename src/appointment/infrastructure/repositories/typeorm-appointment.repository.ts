import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { AppointmentStatus } from 'src/appointment/domain/enums/appointment-status.enum';
import {
  AppointmentCard,
  AppointmentRepo,
} from 'src/appointment/domain/repositories/appointment.repository';
import { AppointmentOrmEntity } from 'src/appointment/infrastructure/entities/typeorm/appointment.entity';
import { Between, MoreThan, Repository } from 'typeorm';

import { AppointmentDto } from '@/appointment/dto/appoinment.dto';

const CARD_RELATIONS = {
  doctor: { specialty: true },
  clinic: true,
} as const;

@Injectable()
export class TypeOrmAppointmentRepository implements AppointmentRepo {
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
  async create(appointment: AppointmentDto): Promise<AppointmentCard> {
    const appoinmentOrm = this.appointmentRepo.create(appointment);

    const saved = await this.appointmentRepo.save(appoinmentOrm);
    return this.toCard(saved);
  }

  async findById(id: string): Promise<AppointmentCard | null> {
    const appoinmentOrm = await this.appointmentRepo.findOne({
      where: { id },
    });
    return appoinmentOrm ? this.toCard(appoinmentOrm) : null;
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
