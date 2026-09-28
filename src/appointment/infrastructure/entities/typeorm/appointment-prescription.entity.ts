import {
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Column,
} from 'typeorm';

@Entity('appointment_prescriptions')
@Index(['appointmentId'], { unique: true })
@Index(['userId', 'appointmentId'])
export class AppointmentPrescriptionOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('uuid')
  appointmentId!: string;

  @Column('uuid')
  userId!: string;

  @Column({ type: 'varchar' })
  storageKey!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  issuedAt!: Date;
}
