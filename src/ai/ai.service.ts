import { randomUUID } from 'crypto';

import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  APPOINTMENT_REPOSITORY,
  type AppointmentRepository,
} from 'src/appointment/domain/repositories/appointment.repository';
import { TooManyRequestsException } from 'src/common/exceptions/too-many-requests.exception';
import {
  DOCTOR_REPOSITORY,
  type DoctorRepository,
} from 'src/doctor/domain/repositories/doctor.repository';
import {
  SPECIALTY_REPOSITORY,
  type SpecialtyRepository,
} from 'src/doctor/domain/repositories/specialty.repository';
import {
  AI_CONVERSATION_STARTED_EVENT,
  AI_MESSAGE_ANSWERED_EVENT,
  AI_EMERGENCY_DETECTED_EVENT,
} from 'src/infrastructure/messaging/event-names';
import { MEDICAL_DISCLAIMER_TEXT } from 'src/medical-question/medical-question.constants';

import { guestOwner, isAccountOwner } from './ai-owner';
import { AI_SYSTEM_INSTRUCTIONS } from './ai.constants';
import {
  boundedHistory,
  createVisibleContentTracker,
  parseSuggestion,
} from './ai.util';
import emergencyRulesData from './domain/emergency-rules.json';
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
  type AiMessageParam,
  type AiTool,
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
    @Inject(APPOINTMENT_REPOSITORY)
    private readonly appointments: AppointmentRepository,
    @Inject(DOCTOR_REPOSITORY)
    private readonly doctors: DoctorRepository,
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
      this.generationErrors.run(() => this.generate(result.message, owner));
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

  private async generate(message: AiMessage, owner: string) {
    const started = Date.now();

    // Emergency Detection
    const isEmergency = emergencyRulesData.keywords.some((k) =>
      message.input.toLowerCase().includes(k.toLowerCase()),
    );

    if (isEmergency) {
      message.content =
        emergencyRulesData.response + '\n\n' + MEDICAL_DISCLAIMER_TEXT;
      message.suggestion = null;
      await this.repository.persistContent(message.id, message.content);

      await this.unitOfWork.execute(async ({ appendEvent }) => {
        await appendEvent(AI_EMERGENCY_DETECTED_EVENT, {
          conversationId: message.conversationId,
          messageId: message.id,
        });
      });

      await this.finish(message, 'completed', {
        inputTokens: null,
        outputTokens: null,
        usageAvailable: false,
        latencyMs: Date.now() - started,
        costUsd: null,
        model: 'emergency-rule',
      });
      return;
    }

    let raw = '';
    let usage: { prompt_tokens: number; completion_tokens: number } | undefined;
    const visibleContent = createVisibleContentTracker();
    const outcome = await this.generationErrors.execute(message, async () => {
      const specialtiesList = (await this.specialties.findAll()).slice(0, 200);
      const history = await this.repository.recentCompletedMessages(
        message.conversationId,
      );
      const system = AI_SYSTEM_INSTRUCTIONS.replace(
        '{{specialties}}',
        JSON.stringify(
          specialtiesList.map((s) => ({ id: s.id, name: s.name })),
        ),
      );

      const messagesParams: AiMessageParam[] = [
        { role: 'system', content: system },
        ...boundedHistory(history).map((h) => ({
          role: h.role as 'user' | 'assistant',
          content: h.content,
        })),
        { role: 'user', content: message.input },
      ];

      const tools: AiTool[] = [
        {
          type: 'function',
          function: {
            name: 'get_doctors',
            description: 'Get list of top doctors.',
            parameters: { type: 'object', properties: {}, required: [] },
          },
        },
        {
          type: 'function',
          function: {
            name: 'get_availability',
            description: 'Get availability and fees for a specific doctor.',
            parameters: {
              type: 'object',
              properties: { doctorId: { type: 'string' } },
              required: ['doctorId'],
            },
          },
        },
        {
          type: 'function',
          function: {
            name: 'get_appointments',
            description: "Get the current patient's upcoming appointments.",
            parameters: { type: 'object', properties: {}, required: [] },
          },
        },
        {
          type: 'function',
          function: {
            name: 'get_policy_snippets',
            description:
              'Get approved policy snippets related to bookings, cancellations, and fees.',
            parameters: {
              type: 'object',
              properties: { query: { type: 'string' } },
              required: ['query'],
            },
          },
        },
      ];

      let isToolCall = true;
      let finalFinishReason: string | undefined;

      while (isToolCall) {
        isToolCall = false;
        const toolCallsAcc: Record<
          string,
          { id: string; name: string; arguments: string }
        > = {};

        for await (const chunk of this.provider.stream(
          messagesParams,
          AbortSignal.timeout(90000),
          tools,
        )) {
          if (chunk.usage) usage = chunk.usage;
          if (chunk.finish) finalFinishReason = chunk.finish;

          if (chunk.toolCalls) {
            for (const tc of chunk.toolCalls) {
              if (!toolCallsAcc[tc.id]) {
                toolCallsAcc[tc.id] = {
                  id: tc.id,
                  name: tc.name,
                  arguments: tc.arguments,
                };
              } else {
                toolCallsAcc[tc.id].arguments += tc.arguments;
              }
            }
          }

          if (chunk.text && Object.keys(toolCallsAcc).length === 0) {
            raw += chunk.text;
            if (raw.length > 24000) throw new Error('Output limit');
            // We append the disclaimer here safely but only persist the actual answer while streaming.
            // Wait, we can't reliably append disclaimer while streaming since it comes in chunks.
            // We will append disclaimer at the end after the loop finishes.
            message.content = visibleContent(raw);
            await this.repository.persistContent(message.id, message.content);
          }
        }

        const toolCallsList = Object.values(toolCallsAcc);
        if (toolCallsList.length > 0) {
          isToolCall = true;
          messagesParams.push({
            role: 'assistant',
            content: raw,
            tool_calls: toolCallsList.map((tc) => ({
              id: tc.id,
              type: 'function',
              function: { name: tc.name, arguments: tc.arguments },
            })),
          });

          for (const tc of toolCallsList) {
            let toolResult = '';
            try {
              if (tc.name === 'get_doctors') {
                const docs = await this.doctors.findTopRanked(10);
                toolResult = JSON.stringify(docs);
              } else if (tc.name === 'get_availability') {
                const args = JSON.parse(tc.arguments) as { doctorId: string };
                const profile = await this.doctors.findProfileById(
                  args.doctorId,
                );
                if (profile) {
                  const pairings = await Promise.all(
                    profile.clinics.map((c) =>
                      this.doctors.findBookablePairing(
                        args.doctorId,
                        c.clinic.id,
                      ),
                    ),
                  );
                  toolResult = JSON.stringify(
                    pairings
                      .filter((p) => p !== null)
                      .map((p) => ({
                        clinic: p.clinic.name,
                        fee: p.fee,
                        schedules: p.schedules.map((s) => ({
                          dayOfWeek: s.dayOfWeek,
                          startTime: s.startTime,
                          endTime: s.endTime,
                        })),
                      })),
                  );
                } else {
                  toolResult = 'Doctor not found';
                }
              } else if (tc.name === 'get_appointments') {
                if (owner.startsWith('g:')) {
                  toolResult =
                    'Guest users cannot access appointment information.';
                } else {
                  const userId = owner.substring(2);
                  // We fetch the next upcoming appointment
                  const upcoming = await this.appointments.findNextUpcoming(
                    userId,
                    new Date(),
                  );
                  toolResult = upcoming
                    ? JSON.stringify(upcoming)
                    : 'No upcoming appointments.';
                }
              } else if (tc.name === 'get_policy_snippets') {
                toolResult =
                  'Patients can cancel appointments up to 24 hours in advance without penalty. Guest users must sign in to view appointments.';
              } else {
                toolResult = 'Unknown capability';
              }
            } catch (err) {
              toolResult =
                'Error executing capability: ' + (err as Error).message;
            }

            messagesParams.push({
              role: 'tool',
              tool_call_id: tc.id,
              name: tc.name,
              content: toolResult,
            });
          }
        }
      }

      if (finalFinishReason !== 'stop' || !message.content.trim())
        throw new Error('Incomplete response');

      message.suggestion = parseSuggestion(raw, specialtiesList);

      // Append disclaimer at the end
      message.content = visibleContent(raw) + '\n\n' + MEDICAL_DISCLAIMER_TEXT;
      await this.repository.persistContent(message.id, message.content);
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
