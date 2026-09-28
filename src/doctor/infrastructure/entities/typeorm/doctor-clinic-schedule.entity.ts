import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { DoctorClinicOrmEntity } from './doctor-clinic.entity';

@Entity('doctor_clinic_schedules')
@Index(['doctorClinicId'])
export class DoctorClinicScheduleOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('uuid')
  doctorClinicId!: string;

  @ManyToOne(() => DoctorClinicOrmEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'doctorClinicId' })
  doctorClinic!: DoctorClinicOrmEntity;

  @Column({ type: 'smallint' })
  dayOfWeek!: number;

  @Column({ type: 'time' })
  startTime!: string;

  @Column({ type: 'time' })
  endTime!: string;

  /** How long one patient gets, so the window above becomes discrete slots. */
  @Column({ type: 'smallint', default: 30 })
  slotMinutes!: number;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
