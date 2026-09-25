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

import { UserOrmEntity } from '@/auth/infrastructure/entities/typeorm/user.entity';
import { CardBrand } from '@/payment-method/domain/enums/card.enum';

@Entity('payment_methods')
@Index(['userId', 'brand', 'last4', 'expiryMonth', 'expiryYear'], {
  unique: true,
})
export class PaymentMethodOrmEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column('uuid') userId!: string;
  @ManyToOne(() => UserOrmEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user!: UserOrmEntity;
  @Column() providerRef!: string;
  @Column({ type: 'enum', enum: CardBrand }) brand!: CardBrand;
  @Column({ length: 4 }) last4!: string;
  @Column() holderName!: string;
  @Column('smallint') expiryMonth!: number;
  @Column('smallint') expiryYear!: number;
  @CreateDateColumn() createdAt!: Date;
  @UpdateDateColumn() updatedAt!: Date;
}
