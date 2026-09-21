import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { DoctorController } from './doctor.controller';
import { DoctorService } from './doctor.service';
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

import { SESSION_REPOSITORY } from '@/auth/domain/repositories/session.repository';
import { SessionOrmEntity } from '@/auth/infrastructure/entities/typeorm/session.entity';
import { TokenOrmEntity } from '@/auth/infrastructure/entities/typeorm/token.entity';
import { TypeOrmSessionRepository } from '@/auth/infrastructure/repositories/session.repository';
import { AuthenticationGuard } from '@/common/guards/authentication.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SessionOrmEntity,
      SpecialtyOrmEntity,
      ClinicOrmEntity,
      DoctorOrmEntity,
      DoctorClinicOrmEntity,
      DoctorClinicScheduleOrmEntity,
      TokenOrmEntity,
    ]),
  ],
  controllers: [DoctorController],
  providers: [
    DoctorService,
    AuthenticationGuard,
    { provide: SPECIALTY_REPOSITORY, useClass: TypeOrmSpecialtyRepository },
    { provide: CLINIC_REPOSITORY, useClass: TypeOrmClinicRepository },
    { provide: DOCTOR_REPOSITORY, useClass: TypeOrmDoctorRepository },
    { provide: SESSION_REPOSITORY, useClass: TypeOrmSessionRepository },
  ],
  exports: [
    SPECIALTY_REPOSITORY,
    CLINIC_REPOSITORY,
    DOCTOR_REPOSITORY,
    SESSION_REPOSITORY,
  ],
})
export class DoctorModule {}
