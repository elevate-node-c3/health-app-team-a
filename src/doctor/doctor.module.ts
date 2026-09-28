import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppointmentModule } from 'src/appointment/appointment.module';
import { BookingHoldOrmEntity } from 'src/appointment/infrastructure/entities/typeorm/booking-hold.entity';
import { AuthModule } from 'src/auth/auth.module';
import { FavouriteModule } from 'src/favourite/favourite.module';
import { SlotHoldOrmEntity } from 'src/slot-hold/infrastructure/entities/typeorm/slot-hold.entity';

import { DoctorController } from './doctor.controller';
import { DoctorAnalyticsListener } from './doctor.events';
import { DoctorService } from './doctor.service';
import { CLINIC_REPOSITORY } from './domain/repositories/clinic.repository';
import { DOCTOR_LEAVE_REPOSITORY } from './domain/repositories/doctor-leave.repository';
import { DOCTOR_REPOSITORY } from './domain/repositories/doctor.repository';
import { HOLD_REPOSITORY } from './domain/repositories/hold.repository';
import { SPECIALTY_REPOSITORY } from './domain/repositories/specialty.repository';
import { ClinicOrmEntity } from './infrastructure/entities/typeorm/clinic.entity';
import { DoctorClinicScheduleOrmEntity } from './infrastructure/entities/typeorm/doctor-clinic-schedule.entity';
import { DoctorClinicOrmEntity } from './infrastructure/entities/typeorm/doctor-clinic.entity';
import { DoctorLeaveOrmEntity } from './infrastructure/entities/typeorm/doctor-leave.entity';
import { DoctorOrmEntity } from './infrastructure/entities/typeorm/doctor.entity';
import { SpecialtyOrmEntity } from './infrastructure/entities/typeorm/specialty.entity';
import { TypeOrmClinicRepository } from './infrastructure/repositories/typeorm-clinic.repository';
import { TypeOrmDoctorLeaveRepository } from './infrastructure/repositories/typeorm-doctor-leave.repository';
import { TypeOrmDoctorRepository } from './infrastructure/repositories/typeorm-doctor.repository';
import { TypeOrmHoldRepository } from './infrastructure/repositories/typeorm-hold.repository';
import { TypeOrmSpecialtyRepository } from './infrastructure/repositories/typeorm-specialty.repository';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SpecialtyOrmEntity,
      ClinicOrmEntity,
      DoctorOrmEntity,
      DoctorClinicOrmEntity,
      DoctorClinicScheduleOrmEntity,
      DoctorLeaveOrmEntity,
      // Read-only, for the hold half of "unbookable". Entity classes only —
      // importing SlotHoldModule here would close a cycle through
      // AppointmentModule, which this module already depends on.
      BookingHoldOrmEntity,
      SlotHoldOrmEntity,
    ]),
    // AuthModule for the guard behind @OptionalAuth().
    AuthModule,
    AppointmentModule,
    FavouriteModule,
  ],
  controllers: [DoctorController],
  providers: [
    DoctorService,
    DoctorAnalyticsListener,
    { provide: SPECIALTY_REPOSITORY, useClass: TypeOrmSpecialtyRepository },
    { provide: CLINIC_REPOSITORY, useClass: TypeOrmClinicRepository },
    { provide: DOCTOR_REPOSITORY, useClass: TypeOrmDoctorRepository },
    {
      provide: DOCTOR_LEAVE_REPOSITORY,
      useClass: TypeOrmDoctorLeaveRepository,
    },
    { provide: HOLD_REPOSITORY, useClass: TypeOrmHoldRepository },
  ],
  exports: [
    SPECIALTY_REPOSITORY,
    CLINIC_REPOSITORY,
    DOCTOR_REPOSITORY,
    DOCTOR_LEAVE_REPOSITORY,
    HOLD_REPOSITORY,
  ],
})
export class DoctorModule {}
