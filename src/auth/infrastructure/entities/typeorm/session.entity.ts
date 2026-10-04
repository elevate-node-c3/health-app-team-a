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
  type Relation,
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

  // `Relation<T>` for the same reason as `TokenOrmEntity.session` - this is
  // the other half of the circular import.
  @OneToMany(() => TokenOrmEntity, (token) => token.session)
  tokens!: Relation<TokenOrmEntity[]>;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
