import { BookingHoldStatus } from 'src/appointment/domain/enums/booking-hold-status.enum';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('booking_holds')
@Index(['doctorId', 'scheduledAt', 'status'])
@Index(['userId', 'status'])
export class BookingHoldOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('uuid')
  userId!: string;

  @Column('uuid')
  doctorId!: string;

  @Column('uuid')
  clinicId!: string;

  @Column({ type: 'uuid', nullable: true })
  reschedulesAppointmentId!: string | null;

  @Column({ type: 'timestamptz' })
  scheduledAt!: Date;

  @Column({ type: 'numeric', precision: 10, scale: 2 })
  frozenAmount!: string;

  @Column({ type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ type: 'varchar', enum: BookingHoldStatus })
  status!: BookingHoldStatus;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
