import { Gender } from 'src/auth/domain/enums/user.enum';
import { UserOrmEntity } from 'src/auth/infrastructure/entities/typeorm/user.entity';
import { MedicalQuestionStatus } from 'src/medical-question/domain/enums/medical-question-status.enum';
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

@Entity('medical_questions')
@Index('IDX_medical_questions_user_deleted', ['userId', 'deletedAt'])
@Index('IDX_medical_questions_unanswered_asked', ['askedAt'], {
  where: `"answeredAt" IS NULL AND "deletedAt" IS NULL`,
})
export class MedicalQuestionOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('uuid')
  userId!: string;

  @ManyToOne(() => UserOrmEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user!: UserOrmEntity;

  @Column({ type: 'varchar', length: 50 })
  concern!: string;

  @Column({ type: 'varchar', length: 250 })
  symptoms!: string;

  @Column({ type: 'varchar', enum: Gender })
  gender!: Gender;

  @Column('smallint')
  age!: number;

  @Column({ default: false })
  isEmergency!: boolean;

  @Column({ type: 'varchar', enum: MedicalQuestionStatus })
  status!: MedicalQuestionStatus;

  @Column({ type: 'timestamptz' })
  askedAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  escalatedAt!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  notifiedAt!: Date | null;

  @Column({ type: 'text', nullable: true })
  answerText!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  answeredAt!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
