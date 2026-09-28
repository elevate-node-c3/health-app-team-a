import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { ClinicOrmEntity } from './clinic.entity';
import { DoctorOrmEntity } from './doctor.entity';

// Type-only: doctor_clinic_schedules points back at doctor_clinics, so a value
// import here would be a runtime cycle. The relation names the entity instead.
import type { DoctorClinicScheduleOrmEntity } from './doctor-clinic-schedule.entity';

@Entity('doctor_clinics')
@Index(['doctorId', 'clinicId'], { unique: true })
export class DoctorClinicOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('uuid')
  doctorId!: string;

  @ManyToOne(() => DoctorOrmEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'doctorId' })
  doctor!: DoctorOrmEntity;

  @Column('uuid')
  clinicId!: string;

  @ManyToOne(() => ClinicOrmEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'clinicId' })
  clinic!: ClinicOrmEntity;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  fee!: number;

  @Column({ default: true })
  isActive!: boolean;

  /** Inverse side, so a pairing can load its recurring hours in one query. */
  @OneToMany('DoctorClinicScheduleOrmEntity', 'doctorClinic')
  schedules!: DoctorClinicScheduleOrmEntity[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
