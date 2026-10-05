import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppointmentOrmEntity } from 'src/appointment/infrastructure/entities/typeorm/appointment.entity';
import { AuthModule } from 'src/auth/auth.module';
import { DoctorClinicOrmEntity } from 'src/doctor/infrastructure/entities/typeorm/doctor-clinic.entity';
import { MessagingModule } from 'src/infrastructure/messaging/messaging.module';

import { SLOT_HOLD_REPOSITORY } from './domain/repositories/slot-hold.repository';
import { SlotHoldOrmEntity } from './infrastructure/entities/typeorm/slot-hold.entity';
import { TypeOrmSlotHoldRepository } from './infrastructure/repositories/typeorm-slot-hold.repository';
import { SlotHoldController } from './slot-hold.controller';
import { SlotHoldReaper } from './slot-hold.job';
import { SlotHoldService } from './slot-hold.service';

@Module({
  imports: [
    AuthModule,
    MessagingModule,
    ScheduleModule.forRoot(),
    TypeOrmModule.forFeature([
      SlotHoldOrmEntity,
      AppointmentOrmEntity,
      DoctorClinicOrmEntity,
    ]),
  ],
  controllers: [SlotHoldController],
  providers: [
    SlotHoldService,
    SlotHoldReaper,
    { provide: SLOT_HOLD_REPOSITORY, useClass: TypeOrmSlotHoldRepository },
  ],
  exports: [SLOT_HOLD_REPOSITORY],
})
export class SlotHoldModule {}
