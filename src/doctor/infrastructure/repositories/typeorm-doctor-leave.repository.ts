import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DoctorLeave } from 'src/doctor/domain/entities/doctor-leave.model';
import {
  CreateDoctorLeaveInput,
  DoctorLeaveRepository,
} from 'src/doctor/domain/repositories/doctor-leave.repository';
import { DoctorLeaveOrmEntity } from 'src/doctor/infrastructure/entities/typeorm/doctor-leave.entity';
import { DoctorLeaveMapper } from 'src/doctor/infrastructure/mappers/doctor-leave.mapper';
import { LessThanOrEqual, MoreThanOrEqual, Repository } from 'typeorm';

@Injectable()
export class TypeOrmDoctorLeaveRepository implements DoctorLeaveRepository {
  constructor(
    @InjectRepository(DoctorLeaveOrmEntity)
    private readonly leaveRepo: Repository<DoctorLeaveOrmEntity>,
  ) {}

  async findOverlapping(
    doctorId: string,
    fromDate: string,
    toDate: string,
  ): Promise<DoctorLeave[]> {
    // Two inclusive ranges overlap when each starts on or before the other
    // ends. Uses IDX_doctor_leaves_doctor_range.
    const ormEntities = await this.leaveRepo.find({
      where: {
        doctorId,
        startDate: LessThanOrEqual(toDate),
        endDate: MoreThanOrEqual(fromDate),
      },
      order: { startDate: 'ASC' },
    });

    return ormEntities.map((ormEntity) =>
      DoctorLeaveMapper.toDomain(ormEntity),
    );
  }

  async create(input: CreateDoctorLeaveInput): Promise<DoctorLeave> {
    const ormEntity = this.leaveRepo.create(input);
    return DoctorLeaveMapper.toDomain(await this.leaveRepo.save(ormEntity));
  }
}
