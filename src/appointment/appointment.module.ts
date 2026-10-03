import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaymentAttemptOrmEntity } from 'src/payment-method/infrastructure/entities/typeorm/payment-attempt.entity';
import { PaymentSessionOrmEntity } from 'src/payment-method/infrastructure/entities/typeorm/payment-session.entity';

import { AuthModule } from '../auth/auth.module';

import { AppointmentBookingService } from './appointment-booking.service';
import { AppointmentHistoryService } from './appointment-history.service';
import { AppointmentController } from './appointment.controller';
import { APPOINTMENT_REPOSITORY } from './domain/repositories/appointment.repository';
import { AppointmentPrescriptionOrmEntity } from './infrastructure/entities/typeorm/appointment-prescription.entity';
import { AppointmentOrmEntity } from './infrastructure/entities/typeorm/appointment.entity';
import { BookingHoldOrmEntity } from './infrastructure/entities/typeorm/booking-hold.entity';
import { TypeOrmAppointmentRepository } from './infrastructure/repositories/typeorm-appointment.repository';

@Module({
  imports: [
    AuthModule,
    TypeOrmModule.forFeature([
      AppointmentOrmEntity,
      BookingHoldOrmEntity,
      AppointmentPrescriptionOrmEntity,
      PaymentAttemptOrmEntity,
      PaymentSessionOrmEntity,
    ]),
  ],
  controllers: [AppointmentController],
  providers: [
    AppointmentBookingService,
    AppointmentHistoryService,
    { provide: APPOINTMENT_REPOSITORY, useClass: TypeOrmAppointmentRepository },
  ],
  exports: [
    APPOINTMENT_REPOSITORY,
    AppointmentBookingService,
    AppointmentHistoryService,
  ],
})
export class AppointmentModule {}
