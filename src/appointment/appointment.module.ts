import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { APPOINTMENT_REPOSITORY } from './domain/repositories/appointment.repository';
import { AppointmentOrmEntity } from './infrastructure/entities/typeorm/appointment.entity';
import { TypeOrmAppointmentRepository } from './infrastructure/repositories/typeorm-appointment.repository';

@Module({
  imports: [TypeOrmModule.forFeature([AppointmentOrmEntity])],
  providers: [
    { provide: APPOINTMENT_REPOSITORY, useClass: TypeOrmAppointmentRepository },
  ],
  exports: [APPOINTMENT_REPOSITORY],
})
export class AppointmentModule {}
