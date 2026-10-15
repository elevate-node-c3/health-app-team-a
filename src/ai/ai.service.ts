import { randomUUID } from 'crypto';

import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  APPOINTMENT_REPOSITORY,
  type AppointmentRepository,
} from 'src/appointment/domain/repositories/appointment.repository';
import { TooManyRequestsException } from 'src/common/exceptions/too-many-requests.exception';
import { DoctorService } from 'src/doctor/doctor.service';
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
  AI_USAGE_LIMIT_REACHED_EVENT,
} from 'src/infrastructure/messaging/event-names';

import { accountUserId, guestOwner, isAccountOwner } from './ai-owner';
import { AI_SYSTEM_INSTRUCTIONS } from './ai.constants';
import {
  safetyRules,
  detectEmergency,
  detectProhibitedIntent,
  emergencyResponse,
  policySnippets,
  prohibitedResponse,
  stripUnverifiedDoctors,
  redactPii,
} from './ai.safety';
import {
  boundedHistory,
  createVisibleContentTracker,
  parseSuggestion,
  withDisclaimer,
  withoutDisclaimer,
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
  type AiMessageParam,
  type AiTool,
} from './domain/services/ai-provider.port';
import { AiGenerationErrorHandler } from './infrastructure/services/ai-generation-error.handler';

import type {
  AiConversationStartedEvent,
  AiMessageAnsweredEvent,
} from './ai.events';
import type {
  AvailabilityDay,
  AvailabilitySlot,
} from 'src/doctor/doctor.types';

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
    private readonly doctorService: DoctorService,
    private readonly config: ConfigService,
    private readonly generationErrors: AiGenerationErrorHandler = new AiGenerationErrorHandler(),
  ) {}

  private readonly logger = new Logger(AiService.name);

  /** Ceiling on paid provider round trips for one answer. */
  private static readonly MAX_TOOL_ROUNDS = 4;

  /** Cumulative wall-clock budget across all rounds of one generation. */
  private static readonly GENERATION_BUDGET_MS = 100000;

  /**
   * Must stay above GENERATION_BUDGET_MS. A legitimate multi-round generation
   * that outlives this window gets flipped to `interrupted` by an SSE poll,
   * after which `persistContent` no-ops and the final conditional UPDATE
   * matches no rows — silently discarding a completed answer.
   */
  private static readonly STALE_AFTER_MS = 150000;

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

        const isEmergency = detectEmergency(input);

        if (!isEmergency) {
          const limit = isAccountOwner(owner) ? 50 : 10;
          if (!(await conversations.consumeDailyQuota(owner, limit)))
            throw new TooManyRequestsException(
              'Daily AI message limit reached',
            );

          const monthlyLimit = this.config.get<number>('ai.monthlyLimit');
          if (monthlyLimit !== undefined) {
            const currentSpend = await conversations.getMonthlySpend();
            if (currentSpend >= monthlyLimit) {
              throw new TooManyRequestsException(
                'Monthly AI spend limit reached',
              );
            }
          }
        }

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

    message.content = withDisclaimer(message.content);

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

  /**
   * Answers from a reviewed rule instead of the model, and suppresses triage.
   *
   * Emergency and prohibited-request handling must not depend on the model
   * cooperating, so neither one reaches the provider at all. The whole body
   * runs inside `generationErrors.execute` for the same reason every other
   * answer does: a broker or database hiccup on the urgent-care path would
   * otherwise leave the message `streaming` until it goes stale and drop the
   * one response a patient most needs to see.
   */
  private async respondFromRule(
    message: AiMessage,
    started: number,
    model: string,
    content: string,
    event?: typeof AI_EMERGENCY_DETECTED_EVENT,
  ) {
    const outcome = await this.generationErrors.execute(message, async () => {
      message.content = withDisclaimer(content);
      message.suggestion = null;
      await this.repository.persistContent(message.id, message.content);
      if (event)
        await this.unitOfWork.execute(async ({ appendEvent }) => {
          await appendEvent(event, {
            conversationId: message.conversationId,
            messageId: message.id,
          });
        });
    });
    await this.finish(message, outcome, {
      inputTokens: null,
      outputTokens: null,
      usageAvailable: false,
      latencyMs: Date.now() - started,
      costUsd: null,
      model,
    });
  }

  private async generate(message: AiMessage, owner: string) {
    const started = Date.now();

    // Emergency detection overrides normal triage: the model is never called.
    if (detectEmergency(message.input)) {
      await this.respondFromRule(
        message,
        started,
        'emergency-rule',
        emergencyResponse(message.input),
        AI_EMERGENCY_DETECTED_EVENT,
      );
      return;
    }

    // Diagnosis, medication, and dosage requests are declined deterministically.
    const prohibited = detectProhibitedIntent(message.input);
    if (prohibited) {
      await this.respondFromRule(
        message,
        started,
        `safety-rule:${prohibited}`,
        prohibitedResponse(message.input),
      );
      return;
    }

    let raw = '';
    // Visible text from rounds already closed out by a tool call. The patient
    // has seen it stream, so it stays in the answer even though only `raw` is
    // replayed to the model as the current assistant turn.
    let delivered = '';
    let usage: { prompt_tokens: number; completion_tokens: number } | undefined;
    // Only doctors a capability call actually returned may be named in the
    // answer; anything else the model produces is stripped before delivery.
    const verifiedDoctors = new Set<string>();
    let visibleContent = createVisibleContentTracker();
    const outcome = await this.generationErrors.execute(message, async () => {
      const specialtiesList = (await this.specialties.findAll()).slice(0, 200);
      const history = (
        await this.repository.recentCompletedMessages(message.conversationId)
      ).map((row) => ({ ...row, content: withoutDisclaimer(row.content) }));
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
          content: redactPii(h.content),
        })),
        { role: 'user', content: redactPii(message.input) },
      ];

      const tools: AiTool[] = [
        {
          type: 'function',
          function: {
            name: 'get_doctors',
            description:
              'List verified doctors on the platform, optionally narrowed to one catalog specialty. Pass specialtyId whenever the question is about a specialty, otherwise the result is the unfiltered top-ranked list.',
            parameters: {
              type: 'object',
              properties: {
                specialtyId: {
                  type: 'string',
                  description: 'A catalog specialty UUID.',
                },
              },
              required: [],
            },
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
      let round = 0;

      while (isToolCall) {
        // A model that keeps requesting tools would otherwise drive unbounded
        // paid round trips, and each round previously got a fresh 90s timeout
        // with no cumulative ceiling — long enough for two rounds to outlive
        // the staleness window and have the finished answer thrown away.
        if (++round > AiService.MAX_TOOL_ROUNDS)
          throw new Error('Tool call limit');
        const remaining = started + AiService.GENERATION_BUDGET_MS - Date.now();
        if (remaining <= 0) throw new Error('Generation budget exhausted');

        isToolCall = false;
        // Accumulate by delta `index`: `id` and `name` arrive only on the
        // first delta of each call, so keying by `id` collects every argument
        // fragment under '' and leaves the real call with empty arguments.
        const toolCallsAcc = new Map<
          number,
          { id: string; name: string; arguments: string }
        >();

        // Each round is a separate assistant turn, so `raw` holds only this
        // round's text: re-sending round-1 prose as the round-2 turn would
        // duplicate it in the model's context. What the patient sees still
        // accumulates across rounds in `delivered`, because prose the model
        // wrote before requesting a tool was already streamed to them and
        // must not disappear from the answer.
        delivered += visibleContent(raw);
        raw = '';
        visibleContent = createVisibleContentTracker();

        for await (const chunk of this.provider.stream(
          messagesParams,
          AbortSignal.timeout(Math.min(remaining, 90000)),
          tools,
        )) {
          if (chunk.usage) {
            if (!usage) usage = { prompt_tokens: 0, completion_tokens: 0 };
            usage.prompt_tokens += chunk.usage.prompt_tokens;
            usage.completion_tokens += chunk.usage.completion_tokens;
          }
          if (chunk.finish) finalFinishReason = chunk.finish;

          if (chunk.toolCalls) {
            for (const tc of chunk.toolCalls) {
              const acc = toolCallsAcc.get(tc.index);
              if (!acc) {
                toolCallsAcc.set(tc.index, {
                  id: tc.id ?? '',
                  name: tc.name ?? '',
                  arguments: tc.arguments,
                });
              } else {
                if (tc.id) acc.id = tc.id;
                if (tc.name) acc.name = tc.name;
                acc.arguments += tc.arguments;
              }
            }
          }

          // Text is accumulated even once tool calls have started — models do
          // interleave prose with a tool request, and dropping it both loses
          // content and can leave the answer empty enough to trip the
          // "Incomplete response" check on a generation that succeeded.
          if (chunk.text) {
            raw += chunk.text;
            if (raw.length > 24000) throw new Error('Output limit');
            // The disclaimer cannot be appended mid-stream (it would land in
            // the middle of the answer as more chunks arrive), so only the
            // answer itself is persisted here; `withDisclaimer` runs once the
            // stream is complete.
            if (toolCallsAcc.size === 0) {
              message.content = delivered + visibleContent(raw);
              await this.repository.persistContent(message.id, message.content);
            }
          }
        }

        const toolCallsList = [...toolCallsAcc.values()];
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
                const args = JSON.parse(tc.arguments || '{}') as {
                  specialtyId?: string;
                };
                // Returning the unfiltered Home top-10 for a specialty
                // question hands the model doctors of the wrong specialty and
                // then requires it to present them as matches — the opposite
                // of what sourcing facts from a capability is for.
                const docs = args.specialtyId
                  ? (await this.doctors.findAllVisible())
                      .filter((d) => d.doctor.specialtyId === args.specialtyId)
                      .slice(0, 10)
                  : await this.doctors.findTopRanked(10);
                for (const d of docs) verifiedDoctors.add(d.doctor.name);
                toolResult = JSON.stringify(
                  docs.map((d) => ({
                    id: d.doctor.id,
                    name: d.doctor.name,
                    title: d.doctor.title,
                    specialtyId: d.doctor.specialtyId,
                    ratingAverage: d.doctor.ratingAverage,
                    yearsOfExperience: d.doctor.yearsOfExperience,
                    cardPrice: d.cardPrice,
                  })),
                );
              } else if (tc.name === 'get_availability') {
                const args = JSON.parse(tc.arguments) as { doctorId: string };
                const profile = await this.doctors.findProfileById(
                  args.doctorId,
                );
                if (profile) {
                  verifiedDoctors.add(profile.doctor.name);
                  const availabilityResults = await Promise.all(
                    profile.clinics.map(async (c) => {
                      try {
                        const availability =
                          await this.doctorService.getAvailability(
                            args.doctorId,
                            { clinicId: c.clinic.id },
                          );
                        return {
                          clinic: c.clinic.name,
                          fee: c.fee,
                          availableDays: availability.data
                            .filter((d: AvailabilityDay) =>
                              d.slots.some((s: AvailabilitySlot) => !s.isTaken),
                            )
                            .map((d: AvailabilityDay) => ({
                              date: String(d.date),
                              availableSlots: d.slots
                                .filter((s: AvailabilitySlot) => !s.isTaken)
                                .map((s: AvailabilitySlot) =>
                                  String(s.localTime),
                                ),
                            })),
                        };
                      } catch {
                        return null;
                      }
                    }),
                  );
                  toolResult = JSON.stringify({
                    doctor: profile.doctor.name,
                    clinics: availabilityResults.filter((r) => r !== null),
                  });
                } else {
                  toolResult = 'Doctor not found';
                }
              } else if (tc.name === 'get_appointments') {
                // Identity comes from `owner`, which the controller derives
                // from the authenticated session. The capability takes no
                // patient identifier at all, so no model-generated argument
                // — including one injected via the conversation — can point
                // this lookup at another user's appointments.
                if (!isAccountOwner(owner)) {
                  toolResult =
                    'Guest users cannot access appointment information.';
                } else {
                  const upcoming = await this.appointments.findNextUpcoming(
                    accountUserId(owner),
                    new Date(),
                  );
                  // The patient's own booking is a capability-returned fact,
                  // so its doctor must be allow-listed too — otherwise naming
                  // them in the answer gets the sentence stripped and the
                  // patient is told nothing about their own appointment.
                  if (upcoming) verifiedDoctors.add(upcoming.doctorName);
                  toolResult = upcoming
                    ? JSON.stringify(upcoming)
                    : 'No upcoming appointments.';
                }
              } else if (tc.name === 'get_policy_snippets') {
                const args = JSON.parse(tc.arguments || '{}') as {
                  query?: string;
                };
                toolResult = policySnippets(args.query ?? '');
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
              content: redactPii(toolResult),
            });
          }
        }
      }

      const full = delivered + visibleContent(raw);
      if (finalFinishReason !== 'stop' || !full.trim())
        throw new Error('Incomplete response');

      message.suggestion = parseSuggestion(raw, specialtiesList);

      const checked = stripUnverifiedDoctors(
        full,
        verifiedDoctors,
        // The specialty catalog tells the check that "see a doctor Today" and
        // "الدكتور الجلدية" name a kind of care, not a person.
        specialtiesList.map((s) => s.name),
      );
      if (checked.removed.length > 0)
        this.logger.warn(
          `Removed ${checked.removed.length} unverified doctor mention(s) from message ${message.id}`,
        );
      if (checked.text.trim()) {
        message.content = withDisclaimer(checked.text);
      } else {
        // Stripping emptied the answer outright, so every sentence named an
        // invented doctor. A bare disclaimer is not an answer, and a search
        // handoff parsed out of text just judged unreliable must not ship
        // with it either.
        message.content = withDisclaimer(safetyRules.fallback.response);
        message.suggestion = null;
      }
      await this.repository.persistContent(message.id, message.content);
    });

    const inputRate = this.config.get<number>('ai.inputCostPerMillion');
    const outputRate = this.config.get<number>('ai.outputCostPerMillion');
    let costUsd =
      usage && inputRate !== undefined && outputRate !== undefined
        ? (usage.prompt_tokens * inputRate +
            usage.completion_tokens * outputRate) /
          1000000
        : null;

    // Conservative accounting for unknown or interrupted usage
    if (
      costUsd === null &&
      this.config.get<number>('ai.monthlyLimit') !== undefined
    ) {
      costUsd = 0.05; // Conservative $0.05 estimate for failed/unknown usage
    }

    if (costUsd !== null) {
      const { previousMonthlySpend, currentMonthlySpend } =
        await this.repository.recordCost(owner, costUsd);
      const monthlyLimit = this.config.get<number>('ai.monthlyLimit');

      if (monthlyLimit !== undefined) {
        const thresholds = [0.6, 0.8, 1.0];
        for (const t of thresholds) {
          if (
            previousMonthlySpend < monthlyLimit * t &&
            currentMonthlySpend >= monthlyLimit * t
          ) {
            await this.unitOfWork.execute(async ({ appendEvent }) => {
              await appendEvent(AI_USAGE_LIMIT_REACHED_EVENT, {
                threshold: t * 100,
              });
            });
          }
        }
      }
    }

    await this.finish(message, outcome, {
      inputTokens: usage?.prompt_tokens ?? null,
      outputTokens: usage?.completion_tokens ?? null,
      usageAvailable: !!usage,
      latencyMs: Date.now() - started,
      costUsd,
      model: this.config.get<string>('ai.model'),
    });
  }
}
