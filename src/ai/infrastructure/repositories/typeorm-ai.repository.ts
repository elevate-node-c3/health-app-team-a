import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { accountOwner, guestOwner } from '../../ai-owner';
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
  async hasGuestConversations(device: string) {
    return (
      (await this.conversations.countBy({ owner: guestOwner(device) })) > 0
    );
  }
  async claimGuest(device: string, userId: string) {
    await this.conversations.update(
      { owner: guestOwner(device) },
      { owner: accountOwner(userId) },
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
  async recordCost(
    owner: string,
    costUsd: number,
  ): Promise<{ previousMonthlySpend: number; currentMonthlySpend: number }> {
    const month = new Date().toISOString().slice(0, 7);

    // Atomic UPSERT into ai_monthly_budgets to reserve/reconcile budget
    const budgetRes = await this.messages.query<[{ spent_usd: string }?]>(
      `INSERT INTO ai_monthly_budgets (month, spent_usd) VALUES ($1, $2)
       ON CONFLICT (month) DO UPDATE SET spent_usd = ai_monthly_budgets.spent_usd + EXCLUDED.spent_usd
       RETURNING spent_usd`,
      [month, costUsd],
    );

    const currentMonthlySpend = parseFloat(budgetRes[0]?.spent_usd || '0');
    const previousMonthlySpend = currentMonthlySpend - costUsd;

    await this.messages.query(
      `INSERT INTO ai_cost_tracking(owner, day, month, cost_usd) VALUES ($1, (now() AT TIME ZONE 'Africa/Cairo')::date, $2, $3)`,
      [owner, month, costUsd],
    );

    return { previousMonthlySpend, currentMonthlySpend };
  }
  async getMonthlySpend(): Promise<number> {
    const month = new Date().toISOString().slice(0, 7);
    const [res] = await this.messages.query<[{ spent_usd: string }?]>(
      `SELECT spent_usd FROM ai_monthly_budgets WHERE month=$1`,
      [month],
    );
    return parseFloat(res?.spent_usd || '0');
  }
}
