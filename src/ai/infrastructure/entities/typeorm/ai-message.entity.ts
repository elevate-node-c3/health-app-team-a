import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';

import { AiConversationOrmEntity } from './ai-conversation.entity';

@Entity('ai_messages')
export class AiMessageOrmEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column('uuid') conversationId!: string;
  @ManyToOne(() => AiConversationOrmEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'conversationId' })
  conversation!: AiConversationOrmEntity;
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
