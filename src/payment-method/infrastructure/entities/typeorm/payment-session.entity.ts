import { PaymentSessionStatus } from 'src/payment-method/domain/enums/payment-session-status.enum';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('payment_sessions')
@Index(['userId', 'paymentAttemptId'])
@Index(['holdId'])
@Index(['status', 'updatedAt'])
export class PaymentSessionOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('uuid')
  userId!: string;

  @Column('uuid', { unique: true })
  paymentAttemptId!: string;

  /** The booking hold this payment is for — the primary booking reference. */
  @Column('uuid')
  holdId!: string;

  /** The appointment created after successful payment, null until booked. */
  @Column({ type: 'uuid', nullable: true })
  appointmentId!: string | null;

  @Column('uuid')
  doctorId!: string;

  @Column('uuid')
  clinicId!: string;

  /** The slot date/time the user is paying for. */
  @Column({ type: 'timestamptz' })
  scheduledAt!: Date;

  /** Stripe PaymentIntent ID, set once the charge is sent to Stripe. */
  @Column({ type: 'varchar', nullable: true })
  stripePaymentIntentId!: string | null;

  @Column({ type: 'numeric', precision: 10, scale: 2 })
  amount!: string;

  @Column({ default: 'EGP' })
  currency!: string;

  @Column({ type: 'varchar', enum: PaymentSessionStatus })
  status!: PaymentSessionStatus;

  /** Additional audit data (doctor name, clinic name, etc.) */
  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, unknown> | null;

  /** Human-readable reason when status is FAILED or REFUNDED. */
  @Column({ type: 'varchar', nullable: true })
  failureReason!: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
