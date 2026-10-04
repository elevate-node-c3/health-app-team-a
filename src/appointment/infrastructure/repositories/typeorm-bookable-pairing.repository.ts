import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DoctorClinicOrmEntity } from 'src/doctor/infrastructure/entities/typeorm/doctor-clinic.entity';
import { findOfferedSlot } from 'src/doctor/infrastructure/offered-slot.query';
import { Repository } from 'typeorm';

import type {
  BookablePairingRepository,
  BookablePairingSnapshot,
} from 'src/appointment/domain/repositories/bookable-pairing.repository';

@Injectable()
export class TypeOrmBookablePairingRepository implements BookablePairingRepository {
  constructor(
    @InjectRepository(DoctorClinicOrmEntity)
    private readonly pairingRepo: Repository<DoctorClinicOrmEntity>,
  ) {}

  async findBookable(
    doctorId: string,
    clinicId: string,
    scheduledAt: Date,
  ): Promise<BookablePairingSnapshot | null> {
    const pairing = await this.pairingRepo.findOne({
      where: {
        doctorId,
        clinicId,
        isActive: true,
        doctor: { isVerified: true },
        clinic: { isActive: true },
      },
      relations: { doctor: { specialty: true }, clinic: true },
    });
    if (!pairing) return null;

    // Reuses the existing query rather than restating the grid rules: it is
    // the same function the availability calendar and the hold path use, so
    // all three agree on what the schedule offers.
    const offered = await findOfferedSlot(
      this.pairingRepo.manager,
      doctorId,
      clinicId,
      scheduledAt,
    );

    return {
      doctorClinicId: pairing.id,
      fee: Number(pairing.fee),
      doctorName: pairing.doctor.name,
      doctorPhoto: pairing.doctor.photo,
      specialtyName: pairing.doctor.specialty.name,
      clinicName: pairing.clinic.name,
      clinicCity: pairing.clinic.city,
      clinicGovernorate: pairing.clinic.governorate,
      slotMinutes: offered?.slotMinutes ?? null,
    };
  }
}
