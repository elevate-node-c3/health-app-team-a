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

import { ClinicOrmEntity } from './clinic.entity';
import { DoctorOrmEntity } from './doctor.entity';

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

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
