import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

import { Gender } from '../../../domain/enums/user.enum';

@Entity('users')
export class UserOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ unique: true })
  email!: string;

  @Column()
  password!: string;

  @Column()
  name!: string;

  @Column()
  phone!: string;

  @Column({ enum: Gender })
  gender!: Gender;

  @Column({ default: true })
  isActive!: boolean;

  @Column({ default: false })
  isVerified!: boolean;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
