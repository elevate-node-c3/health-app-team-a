import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { AppointmentStatus } from 'src/appointment/domain/enums/appointment-status.enum';
import { AppointmentRepo } from 'src/appointment/domain/repositories/appointment.repository';
import { AppointmentOrmEntity } from 'src/appointment/infrastructure/entities/typeorm/appointment.entity';
import { Between, LessThanOrEqual, MoreThan, Repository } from 'typeorm';

import { Appointment } from '@/appointment/domain/entities/appointment.model';
import { AppointmentDto } from '@/appointment/dto/appoinment.dto';

@Injectable()
export class TypeOrmAppointmentRepository implements AppointmentRepo {
  constructor(
    @InjectRepository(AppointmentOrmEntity)
    private readonly appointmentRepo: Repository<AppointmentOrmEntity>,
  ) {}

  async findNextUpcoming(
    bookingId: string,
    now: Date,
  ): Promise<Appointment | null> {
    const appointment = await this.appointmentRepo.findOne({
      where: {
        bookingId,
        status: AppointmentStatus.SCHEDULED,
        scheduledAt: MoreThan(now),
      },
      order: { scheduledAt: 'ASC' },
    });

    return appointment ? this.toCard(appointment) : null;
  }

  async findMostRecentVisit(
    bookingId: string,
    now: Date,
    windowDays: number,
  ): Promise<Appointment | null> {
    const windowStart = new Date(
      now.getTime() - windowDays * 24 * 60 * 60 * 1000,
    );

    const appointment = await this.appointmentRepo.findOne({
      where: {
        bookingId,
        status: AppointmentStatus.COMPLETED,
        scheduledAt: Between(windowStart, now),
      },
      order: { scheduledAt: 'DESC' },
    });

    return appointment ? this.toCard(appointment) : null;
  }
  async create(appointment: AppointmentDto): Promise<Appointment> {
    const appoinmentOrm = this.appointmentRepo.create(appointment);

    const saved = await this.appointmentRepo.save(appoinmentOrm);
    return this.toCard(saved);
  }
  async save(appoinmentOrm: Appointment): Promise<void> {
    await this.appointmentRepo.save(appoinmentOrm);
  }
  async findById(id: string): Promise<Appointment | null> {
    const appoinmentOrm = await this.appointmentRepo.findOne({
      where: { id },
    });
    return appoinmentOrm ? this.toCard(appoinmentOrm) : null;
  }
  async findExpiredUpcomingAppointments(now: Date): Promise<Appointment[]> {
    const entities = await this.appointmentRepo.find({
      where: {
        status: AppointmentStatus.SCHEDULED,
        scheduledAt: LessThanOrEqual(now),
      },
    });

    return entities.map((entity) => this.toCard(entity));
  }
  private toCard(appointment: AppointmentOrmEntity): Appointment {
    return {
      id: appointment.id,
      bookingId: appointment.bookingId,
      scheduledAt: appointment.scheduledAt,
      status: appointment.status,
      createdAt: appointment.createdAt,
      updatedAt: appointment.updatedAt,
    };
  }
}
