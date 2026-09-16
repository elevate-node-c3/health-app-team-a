import { Gender } from 'src/auth/domain/enums/user.enum';
import { DoctorTitle } from 'src/doctor/domain/enums/doctor-title.enum';
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

import { SpecialtyOrmEntity } from './specialty.entity';

@Entity('doctors')
@Index(['specialtyId'])
export class DoctorOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  name!: string;

  @Column({ type: 'varchar', nullable: true })
  photo!: string | null;

  @Column({ type: 'varchar', enum: DoctorTitle })
  title!: DoctorTitle;

  @Column('uuid')
  specialtyId!: string;

  @ManyToOne(() => SpecialtyOrmEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'specialtyId' })
  specialty!: SpecialtyOrmEntity;

  @Column({ type: 'varchar', nullable: true })
  subspecialties!: string | null;

  @Column()
  university!: string;

  @Column({ type: 'int' })
  yearsOfExperience!: number;

  @Column({ type: 'int', default: 0 })
  patientsCount!: number;

  @Column({ type: 'decimal', precision: 3, scale: 2, default: 0 })
  ratingAverage!: number;

  @Column({ type: 'int', default: 0 })
  ratingCount!: number;

  @Column({ type: 'varchar', enum: Gender })
  gender!: Gender;

  @Column({ default: false })
  isVerified!: boolean;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
