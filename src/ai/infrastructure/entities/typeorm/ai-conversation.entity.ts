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
