import { AppointmentStatus } from 'src/appointment/domain/enums/appointment-status.enum';
import { UserOrmEntity } from 'src/auth/infrastructure/entities/typeorm/user.entity';
import { ClinicOrmEntity } from 'src/doctor/infrastructure/entities/typeorm/clinic.entity';
import { DoctorOrmEntity } from 'src/doctor/infrastructure/entities/typeorm/doctor.entity';
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

@Entity('appointments')
@Index(['userId', 'status', 'scheduledAt'])
export class AppointmentOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('uuid')
  userId!: string;

  @ManyToOne(() => UserOrmEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user!: UserOrmEntity;

  @Column('uuid')
  doctorId!: string;

  @ManyToOne(() => DoctorOrmEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'doctorId' })
  doctor!: DoctorOrmEntity;

  @Column({ type: 'uuid', nullable: true })
  clinicId!: string | null;

  @ManyToOne(() => ClinicOrmEntity, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'clinicId' })
  clinic!: ClinicOrmEntity | null;

  @Column({ type: 'timestamptz' })
  scheduledAt!: Date;

  @Column({ type: 'varchar', enum: AppointmentStatus })
  status!: AppointmentStatus;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
