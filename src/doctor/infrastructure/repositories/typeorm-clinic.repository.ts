import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Clinic } from 'src/doctor/domain/entities/clinic.model';
import {
  ClinicRepository,
  CreateClinicInput,
} from 'src/doctor/domain/repositories/clinic.repository';
import { ClinicOrmEntity } from 'src/doctor/infrastructure/entities/typeorm/clinic.entity';
import { ClinicMapper } from 'src/doctor/infrastructure/mappers/clinic.mapper';
import { Repository } from 'typeorm';

@Injectable()
export class TypeOrmClinicRepository implements ClinicRepository {
  constructor(
    @InjectRepository(ClinicOrmEntity)
    private readonly clinicRepo: Repository<ClinicOrmEntity>,
  ) {}

  async findById(id: string): Promise<Clinic | null> {
    const ormEntity = await this.clinicRepo.findOneBy({ id });
    return ormEntity ? ClinicMapper.toDomain(ormEntity) : null;
  }

  async create(input: CreateClinicInput): Promise<Clinic> {
    const ormEntity = this.clinicRepo.create(input);
    return ClinicMapper.toDomain(await this.clinicRepo.save(ormEntity));
  }
}
