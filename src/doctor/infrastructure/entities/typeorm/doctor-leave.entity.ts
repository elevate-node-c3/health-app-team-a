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

import { DoctorOrmEntity } from './doctor.entity';

@Entity('doctor_leaves')
@Index(['doctorId', 'startDate', 'endDate'])
export class DoctorLeaveOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('uuid')
  doctorId!: string;

  @ManyToOne(() => DoctorOrmEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'doctorId' })
  doctor!: DoctorOrmEntity;

  /**
   * Inclusive. `date` columns arrive as 'YYYY-MM-DD' strings, and they are
   * deliberately kept as strings the whole way through — a Date would invite
   * the server's own zone into a decision that is purely about calendar days.
   */
  @Column({ type: 'date' })
  startDate!: string;

  @Column({ type: 'date' })
  endDate!: string;

  @Column({ type: 'varchar', nullable: true })
  reason!: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
