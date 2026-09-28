import { AppointmentStatus } from 'src/appointment/domain/enums/appointment-status.enum';
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

import { BookingOrmEntity } from './booking.entity';

@Entity('appointments')
@Index(['bookingId', 'status', 'scheduledAt'])
export class AppointmentOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('uuid')
  bookingId!: string;

  @ManyToOne(() => BookingOrmEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'bookingId' })
  booking!: BookingOrmEntity;

  @Column({ type: 'timestamptz' })
  scheduledAt!: Date;

  @Column({ type: 'varchar', enum: AppointmentStatus })
  status!: AppointmentStatus;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
