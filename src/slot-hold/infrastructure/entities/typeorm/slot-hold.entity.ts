import { AppointmentOrmEntity } from 'src/appointment/infrastructure/entities/typeorm/appointment.entity';
import { UserOrmEntity } from 'src/auth/infrastructure/entities/typeorm/user.entity';
import { ClinicOrmEntity } from 'src/doctor/infrastructure/entities/typeorm/clinic.entity';
import { DoctorOrmEntity } from 'src/doctor/infrastructure/entities/typeorm/doctor.entity';
import { SlotHoldStatus } from 'src/slot-hold/domain/enums/slot-hold-status.enum';
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

@Entity('slot_holds')
@Index('IDX_slot_holds_active_slot', ['doctorId', 'clinicId', 'scheduledAt'], {
  unique: true,
  where: `"status" = 'ACTIVE'`,
})
@Index('IDX_slot_holds_status_expires', ['status', 'expiresAt'])
export class SlotHoldOrmEntity {
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

  @Column('uuid')
  clinicId!: string;

  @ManyToOne(() => ClinicOrmEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'clinicId' })
  clinic!: ClinicOrmEntity;

  @Column({ type: 'timestamptz' })
  scheduledAt!: Date;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  feeAmount!: number;

  @Column({ type: 'varchar', enum: SlotHoldStatus })
  status!: SlotHoldStatus;

  @Column({ type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ default: false })
  extended!: boolean;

  @Column({ type: 'uuid', nullable: true })
  appointmentId!: string | null;

  @ManyToOne(() => AppointmentOrmEntity, {
    onDelete: 'SET NULL',
    nullable: true,
  })
  @JoinColumn({ name: 'appointmentId' })
  appointment!: AppointmentOrmEntity | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
