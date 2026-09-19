import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DoctorClinicSchedule } from 'src/doctor/domain/entities/doctor-clinic-schedule.model';
import { DoctorClinic } from 'src/doctor/domain/entities/doctor-clinic.model';
import { Doctor } from 'src/doctor/domain/entities/doctor.model';
import {
  CreateDoctorClinicInput,
  CreateDoctorClinicScheduleInput,
  CreateDoctorInput,
  DoctorRepository,
  VisibleDoctor,
} from 'src/doctor/domain/repositories/doctor.repository';
import { DoctorClinicScheduleOrmEntity } from 'src/doctor/infrastructure/entities/typeorm/doctor-clinic-schedule.entity';
import { DoctorClinicOrmEntity } from 'src/doctor/infrastructure/entities/typeorm/doctor-clinic.entity';
import { DoctorOrmEntity } from 'src/doctor/infrastructure/entities/typeorm/doctor.entity';
import {
  DoctorClinicMapper,
  DoctorClinicScheduleMapper,
  DoctorMapper,
} from 'src/doctor/infrastructure/mappers/doctor.mapper';
import { Repository } from 'typeorm';

@Injectable()
export class TypeOrmDoctorRepository implements DoctorRepository {
  constructor(
    @InjectRepository(DoctorOrmEntity)
    private readonly doctorRepo: Repository<DoctorOrmEntity>,
    @InjectRepository(DoctorClinicOrmEntity)
    private readonly doctorClinicRepo: Repository<DoctorClinicOrmEntity>,
    @InjectRepository(DoctorClinicScheduleOrmEntity)
    private readonly scheduleRepo: Repository<DoctorClinicScheduleOrmEntity>,
  ) {}

  async create(input: CreateDoctorInput): Promise<Doctor> {
    const ormEntity = this.doctorRepo.create(input);
    return DoctorMapper.toDomain(await this.doctorRepo.save(ormEntity));
  }

  async addClinicPairing(
    input: CreateDoctorClinicInput,
  ): Promise<DoctorClinic> {
    const ormEntity = this.doctorClinicRepo.create(input);
    return DoctorClinicMapper.toDomain(
      await this.doctorClinicRepo.save(ormEntity),
    );
  }

  async addSchedule(
    input: CreateDoctorClinicScheduleInput,
  ): Promise<DoctorClinicSchedule> {
    const ormEntity = this.scheduleRepo.create(input);
    return DoctorClinicScheduleMapper.toDomain(
      await this.scheduleRepo.save(ormEntity),
    );
  }

  async findVisibleById(id: string): Promise<VisibleDoctor | null> {
    const ormEntity = await this.doctorRepo.findOneBy({
      id,
      isVerified: true,
    });
    if (!ormEntity) return null;

    return {
      doctor: DoctorMapper.toDomain(ormEntity),
      cardPrice: await this.cheapestActiveFee(ormEntity.id),
    };
  }

  async findAllVisible(): Promise<VisibleDoctor[]> {
    const ormEntities = await this.doctorRepo.findBy({ isVerified: true });
    const priceByDoctor = await this.cheapestActiveFees(
      ormEntities.map((ormEntity) => ormEntity.id),
    );

    return ormEntities.map((ormEntity) => ({
      doctor: DoctorMapper.toDomain(ormEntity),
      cardPrice: priceByDoctor.get(ormEntity.id) ?? null,
    }));
  }

  async findTopRanked(limit: number): Promise<VisibleDoctor[]> {
    const ormEntities = await this.doctorRepo.find({
      where: { isVerified: true },
      order: {
        ratingAverage: 'DESC',
        ratingCount: 'DESC',
        patientsCount: 'DESC',
        id: 'ASC',
      },
      take: limit,
    });

    const priceByDoctor = await this.cheapestActiveFees(
      ormEntities.map((ormEntity) => ormEntity.id),
    );

    return ormEntities.map((ormEntity) => ({
      doctor: DoctorMapper.toDomain(ormEntity),
      cardPrice: priceByDoctor.get(ormEntity.id) ?? null,
    }));
  }

  private async cheapestActiveFee(doctorId: string): Promise<number | null> {
    const priceByDoctor = await this.cheapestActiveFees([doctorId]);
    return priceByDoctor.get(doctorId) ?? null;
  }

  /**
   * One aggregate query for however many doctors are asked about, rather than
   * one query per doctor — the price is "cheapest fee among active pairings at
   * active clinics", computed the same way everywhere it's read.
   */
  private async cheapestActiveFees(
    doctorIds: string[],
  ): Promise<Map<string, number>> {
    if (doctorIds.length === 0) return new Map();

    const rows = await this.doctorClinicRepo
      .createQueryBuilder('doctorClinic')
      .innerJoin('doctorClinic.clinic', 'clinic')
      .where('doctorClinic.doctorId IN (:...doctorIds)', { doctorIds })
      .andWhere('doctorClinic.isActive = true')
      .andWhere('clinic.isActive = true')
      .select('doctorClinic.doctorId', 'doctorId')
      .addSelect('MIN(doctorClinic.fee)', 'minFee')
      .groupBy('doctorClinic.doctorId')
      .getRawMany<{ doctorId: string; minFee: string }>();

    return new Map(rows.map((row) => [row.doctorId, Number(row.minFee)]));
  }
}
