import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('ai_conversations')
export class AiConversationOrmEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column() owner!: string;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt!: Date;
}

@Entity('ai_messages')
export class AiMessageOrmEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column('uuid') conversationId!: string;
  @Column('uuid') requestId!: string;
  @Column('text') input!: string;
  @Column('text', { default: '' }) content!: string;
  @Column({ default: 'streaming' }) outcome!: string;
  @Column({ type: 'jsonb', nullable: true }) suggestion!: Record<
    string,
    unknown
  > | null;
  @Column({ type: 'jsonb', nullable: true }) metrics!: Record<
    string,
    unknown
  > | null;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt!: Date;
}
