import { PaymentAttemptStatus } from 'src/payment-method/domain/enums/payment-attempt-status.enum';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('payment_attempts')
@Index(['userId', 'idempotencyKey'], { unique: true })
@Index(['status', 'updatedAt'])
export class PaymentAttemptOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('uuid')
  userId!: string;

  @Column('uuid')
  holdId!: string;

  @Column('uuid')
  paymentMethodId!: string;

  @Column()
  providerRef!: string;

  @Column()
  idempotencyKey!: string;

  @Column({ type: 'numeric', precision: 10, scale: 2 })
  amount!: string;

  @Column({ default: 'EGP' })
  currency!: string;

  @Column({ type: 'varchar', enum: PaymentAttemptStatus })
  status!: PaymentAttemptStatus;

  @Column({ type: 'varchar', nullable: true })
  providerPaymentId!: string | null;

  @Column({ type: 'uuid', nullable: true })
  appointmentId!: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
