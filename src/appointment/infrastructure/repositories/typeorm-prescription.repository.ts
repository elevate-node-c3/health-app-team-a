import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { AppointmentPrescriptionOrmEntity } from 'src/appointment/infrastructure/entities/typeorm/appointment-prescription.entity';
import { Repository } from 'typeorm';

import type {
  Prescription,
  PrescriptionRepository,
} from 'src/appointment/domain/repositories/prescription.repository';

@Injectable()
export class TypeOrmPrescriptionRepository implements PrescriptionRepository {
  constructor(
    @InjectRepository(AppointmentPrescriptionOrmEntity)
    private readonly prescriptionRepo: Repository<AppointmentPrescriptionOrmEntity>,
  ) {}

  async findForAppointment(
    userId: string,
    appointmentId: string,
  ): Promise<Prescription | null> {
    return this.prescriptionRepo.findOneBy({ userId, appointmentId });
  }

  existsForAppointment(appointmentId: string): Promise<boolean> {
    return this.prescriptionRepo.existsBy({ appointmentId });
  }

  issue(
    appointmentId: string,
    userId: string,
    storageKey: string,
  ): Promise<Prescription> {
    return this.prescriptionRepo.save(
      this.prescriptionRepo.create({ appointmentId, userId, storageKey }),
    );
  }
}
