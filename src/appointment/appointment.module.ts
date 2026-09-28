import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AppointmentController } from './appointment.controller';
import { AppointmentScheduler } from './appointment.scheduler';
import { AppointmentService } from './appointment.service';
import { APPOINTMENT_REPO } from './domain/repositories/appointment.repository';
import { BOOKING_REPO } from './domain/repositories/booking.repository';
import { SLOT_REPO } from './domain/repositories/slot.repository';
import { AppointmentOrmEntity } from './infrastructure/entities/typeorm/appointment.entity';
import { BookingOrmEntity } from './infrastructure/entities/typeorm/booking.entity';
import { SlotOrmEntity } from './infrastructure/entities/typeorm/slot.entity';
import { TypeOrmAppointmentRepository } from './infrastructure/repositories/typeorm-appointment.repository';
import { TypeOrmBookingRepo } from './infrastructure/repositories/typeorm-booking.repository';
import { TypeOrmSlotRepo } from './infrastructure/repositories/typeorm-slot.repository';

import { AuthModule } from '@/auth/auth.module';
import { RabbitMQClientConfig } from '@/common/event/rabbitMQ.client';

@Module({
  imports: [
    RabbitMQClientConfig,
    AuthModule,
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
    AppointmentService,
    AppointmentScheduler,
  ],
  controllers: [AppointmentController],
  exports: [APPOINTMENT_REPO, SLOT_REPO, BOOKING_REPO],
})
export class AppointmentModule {}
