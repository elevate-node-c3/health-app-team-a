import { randomUUID } from 'crypto';

import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TooManyRequestsException } from 'src/common/exceptions/too-many-requests.exception';
import {
  SPECIALTY_REPOSITORY,
  type SpecialtyRepository,
} from 'src/doctor/domain/repositories/specialty.repository';
import {
  AI_CONVERSATION_STARTED_EVENT,
  AI_MESSAGE_ANSWERED_EVENT,
} from 'src/infrastructure/messaging/event-names';

import { guestOwner, isAccountOwner } from './ai-owner';
import { AI_SYSTEM_INSTRUCTIONS } from './ai.constants';
import {
  boundedHistory,
  createVisibleContentTracker,
  parseSuggestion,
} from './ai.util';
import {
  AiConversation,
  AiMessage,
  type AiOutcome,
} from './domain/entities/ai.model';
import {
  AI_REPOSITORY,
  type AiRepository,
} from './domain/repositories/ai.repository';
import {
  AI_UNIT_OF_WORK,
  type AiUnitOfWork,
} from './domain/repositories/unit-of-work';
import {
  AI_PROVIDER,
  type AiProvider,
} from './domain/services/ai-provider.port';
import { AiGenerationErrorHandler } from './infrastructure/services/ai-generation-error.handler';

import type {
  AiConversationStartedEvent,
  AiMessageAnsweredEvent,
} from './ai.events';

@Injectable()
export class AiService {
  constructor(
    @Inject(AI_REPOSITORY) private readonly repository: AiRepository,
    @Inject(AI_UNIT_OF_WORK) private readonly unitOfWork: AiUnitOfWork,
    @Inject(AI_PROVIDER) private readonly provider: AiProvider,
    @Inject(SPECIALTY_REPOSITORY)
    private readonly specialties: SpecialtyRepository,
    private readonly config: ConfigService,
    private readonly generationErrors: AiGenerationErrorHandler = new AiGenerationErrorHandler(),
  ) {}

  private static readonly STALE_AFTER_MS = 120000;

  async claim(device: string, userId: string): Promise<void> {
    // Most authenticated requests have nothing left to migrate after the
    // first claim; this check avoids taking the advisory lock and opening a
    // transaction on every one of them.
    if (!(await this.repository.hasGuestConversations(device))) return;
    await this.unitOfWork.execute(async ({ conversations, lockOwner }) => {
      await lockOwner(guestOwner(device));
      await conversations.claimGuest(device, userId);
    });
  }

  async create(owner: string) {
    return this.unitOfWork.execute(
      async ({ conversations, lockOwner, appendEvent }) => {
        await lockOwner(owner);
        const conversation = await conversations.createConversation(
          new AiConversation(randomUUID(), owner, new Date()),
        );
        const event: AiConversationStartedEvent = {
          conversationId: conversation.id,
        };
        await appendEvent(AI_CONVERSATION_STARTED_EVENT, event);
        return conversation;
      },
    );
  }

  list(owner: string) {
    return this.repository.listConversations(owner);
  }

  async get(id: string, owner: string) {
    const conversation = await this.repository.findConversation(id, owner);
    if (!conversation) throw new NotFoundException('Conversation not found');
    const messages = await Promise.all(
      (await this.repository.listMessages(id)).map((message) =>
        this.resolveIfStale(id, message),
      ),
    );
    return { ...conversation, messages };
  }

  async send(id: string, owner: string, requestId: string, input: string) {
    await this.get(id, owner);
    const result = await this.unitOfWork.execute(
      async ({ conversations, lockOwner }) => {
        await lockOwner(owner);
        const conversation = await conversations.findConversation(id, owner);
        if (!conversation)
          throw new NotFoundException('Conversation not found');
        const existing = await conversations.findRequest(id, requestId);
        if (existing) {
          if (existing.input !== input)
            throw new ConflictException('Request ID already used');
          return { message: existing, fresh: false };
        }
        if (await conversations.countMessages(id, 'streaming'))
          throw new ConflictException('A response is already in progress');
        if ((await conversations.countMessages(id)) >= 200)
          throw new BadRequestException('Please start a new conversation');
        const limit = isAccountOwner(owner) ? 50 : 10;
        if (!(await conversations.consumeDailyQuota(owner, limit)))
          throw new TooManyRequestsException('Daily AI message limit reached');
        const message = await conversations.createMessage(
          new AiMessage(
            randomUUID(),
            id,
            requestId,
            input,
            '',
            'streaming',
            null,
            null,
            new Date(),
          ),
        );
        return { message, fresh: true };
      },
    );
    if (result.fresh)
      this.generationErrors.run(() => this.generate(result.message));
    return result.message;
  }

  /** Verifies ownership once, then delegates to the unauthenticated poll used by the SSE loop. */
  async message(id: string, messageId: string, owner: string) {
    if (!(await this.repository.findConversation(id, owner)))
      throw new NotFoundException('Conversation not found');
    return this.pollMessage(id, messageId);
  }

  /**
   * Reads current message state without re-checking ownership. Ownership is
   * immutable for the lifetime of a conversation, so the SSE loop in
   * AiController can call this on every poll tick instead of re-running
   * `message()`'s conversation lookup hundreds of times per generation.
   */
  async pollMessage(id: string, messageId: string) {
    const message = await this.repository.findMessage(id, messageId);
    if (!message) throw new NotFoundException('Message not found');
    return this.resolveIfStale(id, message);
  }

  /**
   * A dead process must never cause automatic regeneration (provider timeout
   * is 90s). If the message is still "streaming" well past that, mark it
   * interrupted — but background generation may complete it in the gap
   * between reading and writing, so `finish()`'s result (not an assumption)
   * decides what we report: a failed conditional update means the message
   * was already resolved elsewhere, and the persisted row is authoritative.
   */
  private async resolveIfStale(id: string, message: AiMessage) {
    if (
      message.outcome !== 'streaming' ||
      Date.now() - message.createdAt.getTime() <= AiService.STALE_AFTER_MS
    )
      return message;
    const metrics = {
      inputTokens: null,
      outputTokens: null,
      costUsd: null,
      latencyMs: Date.now() - message.createdAt.getTime(),
      usageAvailable: false,
    };
    if (await this.finish(message, 'interrupted', metrics)) {
      message.outcome = 'interrupted';
      message.metrics = metrics;
      return message;
    }
    const persisted = await this.repository.findMessage(id, message.id);
    if (!persisted) throw new NotFoundException('Message not found');
    return persisted;
  }

  /** Returns whether this call actually transitioned the message (false if it was already resolved). */
  private async finish(
    message: AiMessage,
    outcome: AiOutcome,
    metrics: Record<string, unknown>,
  ): Promise<boolean> {
    return this.unitOfWork.execute(async ({ conversations, appendEvent }) => {
      const changed = await conversations.completeMessage(
        message,
        outcome,
        metrics,
      );
      if (changed) {
        const event: AiMessageAnsweredEvent = {
          conversationId: message.conversationId,
          messageId: message.id,
          outcome,
          ...metrics,
        };
        await appendEvent(AI_MESSAGE_ANSWERED_EVENT, event);
      }
      return changed;
    });
  }

  private async generate(message: AiMessage) {
    const started = Date.now();
    let raw = '';
    let usage: { prompt_tokens: number; completion_tokens: number } | undefined;
    const visibleContent = createVisibleContentTracker();
    const outcome = await this.generationErrors.execute(message, async () => {
      const specialties = (await this.specialties.findAll()).slice(0, 200);
      const history = await this.repository.recentCompletedMessages(
        message.conversationId,
      );
      const system = AI_SYSTEM_INSTRUCTIONS.replace(
        '{{specialties}}',
        JSON.stringify(specialties.map((s) => ({ id: s.id, name: s.name }))),
      );
      let finish: string | undefined;
      for await (const chunk of this.provider.stream(
        [
          { role: 'system', content: system },
          ...boundedHistory(history),
          { role: 'user', content: message.input },
        ],
        AbortSignal.timeout(90000),
      )) {
        if (chunk.usage) usage = chunk.usage;
        if (chunk.finish) finish = chunk.finish;
        if (chunk.text) {
          raw += chunk.text;
          if (raw.length > 24000) throw new Error('Output limit');
          message.content = visibleContent(raw);
          await this.repository.persistContent(message.id, message.content);
        }
      }
      if (finish !== 'stop' || !message.content.trim())
        throw new Error('Incomplete response');
      message.suggestion = parseSuggestion(raw, specialties);
    });
    const inputRate = this.config.get<number>('ai.inputCostPerMillion');
    const outputRate = this.config.get<number>('ai.outputCostPerMillion');
    await this.finish(message, outcome, {
      inputTokens: usage?.prompt_tokens ?? null,
      outputTokens: usage?.completion_tokens ?? null,
      usageAvailable: !!usage,
      latencyMs: Date.now() - started,
      costUsd:
        usage && inputRate !== undefined && outputRate !== undefined
          ? (usage.prompt_tokens * inputRate +
              usage.completion_tokens * outputRate) /
            1000000
          : null,
      model: this.config.get<string>('ai.model'),
    });
  }
}
