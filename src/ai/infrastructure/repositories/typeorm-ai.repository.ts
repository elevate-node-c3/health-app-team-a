import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { AiConversationOrmEntity } from '../entities/typeorm/ai-conversation.entity';
import { AiMessageOrmEntity } from '../entities/typeorm/ai-message.entity';
import { AiConversationMapper } from '../mappers/ai-conversation.mapper';
import { AiMessageMapper } from '../mappers/ai-message.mapper';

import type {
  AiConversation,
  AiMessage,
  AiOutcome,
} from '../../domain/entities/ai.model';
import type { AiRepository } from '../../domain/repositories/ai.repository';

@Injectable()
export class TypeOrmAiRepository implements AiRepository {
  constructor(
    @InjectRepository(AiConversationOrmEntity)
    private readonly conversations: Repository<AiConversationOrmEntity>,
    @InjectRepository(AiMessageOrmEntity)
    private readonly messages: Repository<AiMessageOrmEntity>,
  ) {}

  async findConversation(id: string, owner: string) {
    const row = await this.conversations.findOneBy({ id, owner });
    return row ? AiConversationMapper.toDomain(row) : null;
  }
  async listConversations(owner: string) {
    return (
      await this.conversations.find({
        where: { owner },
        order: { createdAt: 'DESC' },
        take: 100,
      })
    ).map(AiConversationMapper.toDomain);
  }
  async createConversation(conversation: AiConversation) {
    return AiConversationMapper.toDomain(
      await this.conversations.save(this.conversations.create(conversation)),
    );
  }
  async claimGuest(device: string, userId: string) {
    await this.conversations.update(
      { owner: `g:${device}` },
      { owner: `u:${userId}` },
    );
  }
  async listMessages(conversationId: string) {
    return (
      await this.messages.find({
        where: { conversationId },
        order: { createdAt: 'ASC' },
        take: 200,
      })
    ).map(AiMessageMapper.toDomain);
  }
  async recentCompletedMessages(conversationId: string) {
    return (
      await this.messages.find({
        where: { conversationId, outcome: 'completed' },
        order: { createdAt: 'DESC' },
        take: 8,
      })
    )
      .map(AiMessageMapper.toDomain)
      .reverse();
  }
  async findMessage(conversationId: string, id: string) {
    const row = await this.messages.findOneBy({ conversationId, id });
    return row ? AiMessageMapper.toDomain(row) : null;
  }
  async findRequest(conversationId: string, requestId: string) {
    const row = await this.messages.findOneBy({ conversationId, requestId });
    return row ? AiMessageMapper.toDomain(row) : null;
  }
  countMessages(conversationId: string, outcome?: AiOutcome) {
    return this.messages.countBy(
      outcome ? { conversationId, outcome } : { conversationId },
    );
  }
  async createMessage(message: AiMessage) {
    return AiMessageMapper.toDomain(
      await this.messages.save(this.messages.create(message)),
    );
  }
  async persistContent(id: string, content: string) {
    await this.messages.update({ id, outcome: 'streaming' }, { content });
  }
  async completeMessage(
    message: AiMessage,
    outcome: AiOutcome,
    metrics: Record<string, unknown>,
  ) {
    const result = await this.messages.query<[unknown[], number]>(
      "UPDATE ai_messages SET content=$2, suggestion=$3::jsonb, outcome=$4, metrics=$5::jsonb WHERE id=$1 AND outcome='streaming' RETURNING id",
      [
        message.id,
        message.content,
        JSON.stringify(message.suggestion),
        outcome,
        JSON.stringify(metrics),
      ],
    );
    return result[1] > 0;
  }
  async consumeDailyQuota(owner: string, limit: number) {
    const rows = await this.messages.query<unknown[]>(
      `INSERT INTO ai_daily_usage(owner, day, count) VALUES ($1, (now() AT TIME ZONE 'Africa/Cairo')::date, 1) ON CONFLICT(owner, day) DO UPDATE SET count=ai_daily_usage.count+1 WHERE ai_daily_usage.count<$2 RETURNING count`,
      [owner, limit],
    );
    return rows.length > 0;
  }
}
