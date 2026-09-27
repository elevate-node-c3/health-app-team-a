import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from '../auth/auth.module';

import { AppointmentBookingService } from './appointment-booking.service';
import { AppointmentController } from './appointment.controller';
import { APPOINTMENT_REPOSITORY } from './domain/repositories/appointment.repository';
import { AppointmentOrmEntity } from './infrastructure/entities/typeorm/appointment.entity';
import { BookingHoldOrmEntity } from './infrastructure/entities/typeorm/booking-hold.entity';
import { TypeOrmAppointmentRepository } from './infrastructure/repositories/typeorm-appointment.repository';

@Module({
  imports: [
    AuthModule,
    TypeOrmModule.forFeature([AppointmentOrmEntity, BookingHoldOrmEntity]),
  ],
  controllers: [AppointmentController],
  providers: [
    AppointmentBookingService,
    { provide: APPOINTMENT_REPOSITORY, useClass: TypeOrmAppointmentRepository },
  ],
  exports: [APPOINTMENT_REPOSITORY, AppointmentBookingService],
})
export class AppointmentModule {}
