import { UserOrmEntity } from 'src/auth/infrastructure/entities/typeorm/user.entity';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { TokenOrmEntity } from './token.entity';

@Entity('sessions')
@Index(['userId', 'id'])
export class SessionOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('uuid')
  userId!: string;

  @ManyToOne(() => UserOrmEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user!: UserOrmEntity;

  @Column({ type: 'varchar', nullable: true })
  deviceInfo!: string | null;

  @Column({ default: false })
  revoked!: boolean;

  @Column({ type: 'timestamp' })
  expiresAt!: Date;

  @OneToMany(() => TokenOrmEntity, (token) => token.session)
  tokens!: TokenOrmEntity[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
