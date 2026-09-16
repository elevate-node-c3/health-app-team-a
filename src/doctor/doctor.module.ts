import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CLINIC_REPOSITORY } from './domain/repositories/clinic.repository';
import { DOCTOR_REPOSITORY } from './domain/repositories/doctor.repository';
import { SPECIALTY_REPOSITORY } from './domain/repositories/specialty.repository';
import { ClinicOrmEntity } from './infrastructure/entities/typeorm/clinic.entity';
import { DoctorClinicScheduleOrmEntity } from './infrastructure/entities/typeorm/doctor-clinic-schedule.entity';
import { DoctorClinicOrmEntity } from './infrastructure/entities/typeorm/doctor-clinic.entity';
import { DoctorOrmEntity } from './infrastructure/entities/typeorm/doctor.entity';
import { SpecialtyOrmEntity } from './infrastructure/entities/typeorm/specialty.entity';
import { TypeOrmClinicRepository } from './infrastructure/repositories/typeorm-clinic.repository';
import { TypeOrmDoctorRepository } from './infrastructure/repositories/typeorm-doctor.repository';
import { TypeOrmSpecialtyRepository } from './infrastructure/repositories/typeorm-specialty.repository';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SpecialtyOrmEntity,
      ClinicOrmEntity,
      DoctorOrmEntity,
      DoctorClinicOrmEntity,
      DoctorClinicScheduleOrmEntity,
    ]),
  ],
  providers: [
    { provide: SPECIALTY_REPOSITORY, useClass: TypeOrmSpecialtyRepository },
    { provide: CLINIC_REPOSITORY, useClass: TypeOrmClinicRepository },
    { provide: DOCTOR_REPOSITORY, useClass: TypeOrmDoctorRepository },
  ],
  exports: [SPECIALTY_REPOSITORY, CLINIC_REPOSITORY, DOCTOR_REPOSITORY],
})
export class DoctorModule {}
