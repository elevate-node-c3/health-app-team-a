import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DoctorClinicOrmEntity } from 'src/doctor/infrastructure/entities/typeorm/doctor-clinic.entity';
import { PaymentAttemptOrmEntity } from 'src/payment-method/infrastructure/entities/typeorm/payment-attempt.entity';
import { PaymentSessionOrmEntity } from 'src/payment-method/infrastructure/entities/typeorm/payment-session.entity';

import { AuthModule } from '../auth/auth.module';
import { InternalAdminGuard } from '../common/guards/internal-admin.guard';

import { AppointmentBookingService } from './appointment-booking.service';
import { AppointmentHistoryService } from './appointment-history.service';
import { AppointmentReminderJob } from './appointment-reminder.job';
import { AppointmentController } from './appointment.controller';
import { APPOINTMENT_REPOSITORY } from './domain/repositories/appointment.repository';
import { BOOKABLE_PAIRING_REPOSITORY } from './domain/repositories/bookable-pairing.repository';
import { BOOKING_HOLD_REPOSITORY } from './domain/repositories/booking-hold.repository';
import { PRESCRIPTION_REPOSITORY } from './domain/repositories/prescription.repository';
import { APPOINTMENT_UNIT_OF_WORK } from './domain/repositories/unit-of-work';
import { AppointmentPrescriptionOrmEntity } from './infrastructure/entities/typeorm/appointment-prescription.entity';
import { AppointmentOrmEntity } from './infrastructure/entities/typeorm/appointment.entity';
import { BookingHoldOrmEntity } from './infrastructure/entities/typeorm/booking-hold.entity';
import { TypeOrmAppointmentRepository } from './infrastructure/repositories/typeorm-appointment.repository';
import { TypeOrmBookablePairingRepository } from './infrastructure/repositories/typeorm-bookable-pairing.repository';
import { TypeOrmBookingHoldRepository } from './infrastructure/repositories/typeorm-booking-hold.repository';
import { TypeOrmPrescriptionRepository } from './infrastructure/repositories/typeorm-prescription.repository';
import { TypeOrmAppointmentUnitOfWork } from './infrastructure/unit-of-work/typeorm-unit-of-work';

@Module({
  imports: [
    AuthModule,
    TypeOrmModule.forFeature([
      AppointmentOrmEntity,
      BookingHoldOrmEntity,
      AppointmentPrescriptionOrmEntity,
      PaymentAttemptOrmEntity,
      PaymentSessionOrmEntity,
      DoctorClinicOrmEntity,
    ]),
  ],
  controllers: [AppointmentController],
  providers: [
    InternalAdminGuard,
    AppointmentBookingService,
    AppointmentHistoryService,
    AppointmentReminderJob,
    { provide: APPOINTMENT_REPOSITORY, useClass: TypeOrmAppointmentRepository },
    {
      provide: BOOKING_HOLD_REPOSITORY,
      useClass: TypeOrmBookingHoldRepository,
    },
    {
      provide: PRESCRIPTION_REPOSITORY,
      useClass: TypeOrmPrescriptionRepository,
    },
    {
      provide: BOOKABLE_PAIRING_REPOSITORY,
      useClass: TypeOrmBookablePairingRepository,
    },
    {
      provide: APPOINTMENT_UNIT_OF_WORK,
      useClass: TypeOrmAppointmentUnitOfWork,
    },
  ],
  exports: [
    APPOINTMENT_REPOSITORY,
    BOOKING_HOLD_REPOSITORY,
    PRESCRIPTION_REPOSITORY,
    BOOKABLE_PAIRING_REPOSITORY,
    APPOINTMENT_UNIT_OF_WORK,
    AppointmentBookingService,
    AppointmentHistoryService,
  ],
})
export class AppointmentModule {}
