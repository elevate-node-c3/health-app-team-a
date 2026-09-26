import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { SlotOrmEntity } from './slot.entity';

import { BookingStatus } from '@/appointment/domain/enums/booking-status.enum';
import { UserOrmEntity } from '@/auth/infrastructure/entities/typeorm/user.entity';

@Entity()
export class BookingOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('uuid')
  userId!: string;

  @ManyToOne(() => UserOrmEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user!: UserOrmEntity;

  @Column('uuid')
  slotId!: string;

  @ManyToOne(() => SlotOrmEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'slotId' })
  slot!: SlotOrmEntity;

  @Column()
  expiresAt!: string;

  @Column({
    type: 'enum',
    enum: BookingStatus,
  })
  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
  status: any;
}
