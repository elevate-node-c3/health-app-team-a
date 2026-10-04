import { TokenType } from 'src/auth/domain/enums/token.enum';
import { UserOrmEntity } from 'src/auth/infrastructure/entities/typeorm/user.entity';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  type Relation,
} from 'typeorm';

import { SessionOrmEntity } from './session.entity';

@Entity('tokens')
@Index(['userId', 'type'])
export class TokenOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('uuid')
  userId!: string;

  @ManyToOne(() => UserOrmEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user!: UserOrmEntity;

  @Column({ type: 'varchar', default: TokenType.REFRESH })
  type!: TokenType;

  @Column('uuid')
  sessionId!: string;

  // `Relation<T>` rather than the bare type: tokens and sessions import each
  // other, and with `emitDecoratorMetadata` a bare type makes TypeScript emit
  // an eager `design:type` reference to the half-initialised class, which
  // throws a TDZ error for anyone importing these two modules directly. The
  // wrapper is TypeORM's documented remedy for circular relations.
  @ManyToOne(() => SessionOrmEntity, (session) => session.tokens, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'sessionId' })
  session!: Relation<SessionOrmEntity>;

  @Column({ unique: true })
  jtiHash!: string;

  @Column({ type: 'timestamp' })
  expiresAt!: Date;

  @Column({ default: false })
  revoked!: boolean;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
