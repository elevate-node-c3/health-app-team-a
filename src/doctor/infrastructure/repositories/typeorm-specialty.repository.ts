import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Specialty } from 'src/doctor/domain/entities/specialty.model';
import {
  CreateSpecialtyInput,
  SpecialtyRepository,
} from 'src/doctor/domain/repositories/specialty.repository';
import { SpecialtyOrmEntity } from 'src/doctor/infrastructure/entities/typeorm/specialty.entity';
import { SpecialtyMapper } from 'src/doctor/infrastructure/mappers/specialty.mapper';
import { Repository } from 'typeorm';

@Injectable()
export class TypeOrmSpecialtyRepository implements SpecialtyRepository {
  constructor(
    @InjectRepository(SpecialtyOrmEntity)
    private readonly specialtyRepo: Repository<SpecialtyOrmEntity>,
  ) {}

  async findById(id: string): Promise<Specialty | null> {
    const ormEntity = await this.specialtyRepo.findOneBy({ id });
    return ormEntity ? SpecialtyMapper.toDomain(ormEntity) : null;
  }

  async findAll(): Promise<Specialty[]> {
    const ormEntities = await this.specialtyRepo.find();
    return ormEntities.map((ormEntity) => SpecialtyMapper.toDomain(ormEntity));
  }

  async create(input: CreateSpecialtyInput): Promise<Specialty> {
    const ormEntity = this.specialtyRepo.create(input);
    return SpecialtyMapper.toDomain(await this.specialtyRepo.save(ormEntity));
  }
}
