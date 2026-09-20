import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { UserOrmEntity } from '@/auth/infrastructure/entities/typeorm/user.entity';
import { DoctorOrmEntity } from '@/doctor/infrastructure/entities/typeorm/doctor.entity';

@Entity('favorite-doctor')
export class FavoriteDoctorOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  userID!: string;

  @ManyToOne(() => UserOrmEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userID' })
  user!: UserOrmEntity;

  @Column()
  doctorID!: string;

  @ManyToOne(() => DoctorOrmEntity)
  @JoinColumn({ name: 'doctorID' })
  doctor!: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
