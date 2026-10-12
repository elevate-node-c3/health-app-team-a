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

  @Column({ type: 'uuid', nullable: true })
  doctorId!: string | null;

  @ManyToOne(() => DoctorOrmEntity, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'doctorId' })
  doctor!: DoctorOrmEntity | null;

  @Column({ type: 'uuid', nullable: true })
  clinicId!: string | null;

  @ManyToOne(() => ClinicOrmEntity, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'clinicId' })
  clinic!: ClinicOrmEntity | null;

  @Column({ type: 'varchar', nullable: true })
  doctorNameSnapshot!: string | null;

  @Column({ type: 'varchar', nullable: true })
  doctorPhotoSnapshot!: string | null;

  @Column({ type: 'varchar', nullable: true })
  specialtyNameSnapshot!: string | null;

  @Column({ type: 'varchar', nullable: true })
  clinicNameSnapshot!: string | null;

  @Column({ type: 'varchar', nullable: true })
  clinicAreaSnapshot!: string | null;

  @Column({ type: 'timestamptz' })
  scheduledAt!: Date;

  @Column({ type: 'smallint', nullable: true })
  durationMinutes!: number | null;

  @Column({ type: 'varchar', enum: AppointmentStatus })
  status!: AppointmentStatus;

  @Column({ type: 'timestamptz', nullable: true })
  reminderSentAt!: Date | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
