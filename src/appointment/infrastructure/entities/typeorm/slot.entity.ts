import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { SlotStatus } from '@/appointment/domain/enums/slot-status.enum';
import { DoctorClinicScheduleOrmEntity } from '@/doctor/infrastructure/entities/typeorm/doctor-clinic-schedule.entity';

@Entity('slots')
export class SlotOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('uuid')
  doctorClinicScheduleId!: string;

  @ManyToOne(() => DoctorClinicScheduleOrmEntity, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({
    name: 'doctorClinicScheduleId',
  })
  doctorClinicSchedule!: DoctorClinicScheduleOrmEntity;

  @Column({ type: 'date' })
  date!: Date;

  @Column({ type: 'time' })
  startTime!: Date;

  @Column({ type: 'time' })
  endTime!: Date;

  @Column({
    type: 'enum',
    enum: SlotStatus,
  })
  status!: SlotStatus;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
