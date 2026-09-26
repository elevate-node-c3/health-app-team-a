import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { APPOINTMENT_REPO } from './domain/repositories/appointment.repository';
import { BOOKING_REPO } from './domain/repositories/booking.repository';
import { SLOT_REPO } from './domain/repositories/slot.repository';
import { AppointmentOrmEntity } from './infrastructure/entities/typeorm/appointment.entity';
import { BookingOrmEntity } from './infrastructure/entities/typeorm/booking.entity';
import { SlotOrmEntity } from './infrastructure/entities/typeorm/slot.entity';
import { TypeOrmAppointmentRepository } from './infrastructure/repositories/typeorm-appointment.repository';
import { TypeOrmBookingRepo } from './infrastructure/repositories/typeorm-booking.repository';
import { TypeOrmSlotRepo } from './infrastructure/repositories/typeorm-slot.repository';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AppointmentOrmEntity,
      SlotOrmEntity,
      BookingOrmEntity,
    ]),
  ],
  providers: [
    { provide: APPOINTMENT_REPO, useClass: TypeOrmAppointmentRepository },
    { provide: BOOKING_REPO, useClass: TypeOrmBookingRepo },
    { provide: SLOT_REPO, useClass: TypeOrmSlotRepo },
  ],
  exports: [APPOINTMENT_REPO, SLOT_REPO, BOOKING_REPO],
})
export class AppointmentModule {}
