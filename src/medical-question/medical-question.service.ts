import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Gender } from 'src/auth/domain/enums/user.enum';
import { paginate } from 'src/common/utils/pagination.util';
import {
  MEDICAL_QUESTION_ANSWERED_EVENT,
  MEDICAL_QUESTION_ASKED_EVENT,
  QUESTION_ANSWER_WINDOW_BREACHED_EVENT,
} from 'src/infrastructure/messaging/event-names';
import { EVENT_PUBLISHER } from 'src/infrastructure/messaging/event-publisher.port';
import { MedicalQuestionStatus } from 'src/medical-question/domain/enums/medical-question-status.enum';
import { MEDICAL_QUESTION_REPOSITORY } from 'src/medical-question/domain/repositories/medical-question.repository';
import { AskMedicalQuestionDto } from 'src/medical-question/dto/ask-medical-question.dto';
import {
  EMERGENCY_CANNED_RESPONSE_TEXT,
  ESCALATE_AFTER_MS,
  MEDICAL_DISCLAIMER_TEXT,
  NOTIFY_AFTER_MS,
  SWEEP_BATCH_SIZE,
} from 'src/medical-question/medical-question.constants';

import type { Paginated } from 'src/common/utils/pagination.util';
import type { EventPublisher } from 'src/infrastructure/messaging/event-publisher.port';
import type { MedicalQuestion } from 'src/medical-question/domain/entities/medical-question.model';
import type { MedicalQuestionRepository } from 'src/medical-question/domain/repositories/medical-question.repository';
import type {
  MedicalQuestionAnsweredEvent,
  MedicalQuestionAskedEvent,
  QuestionAnswerWindowBreachedEvent,
  QuestionAnswerWindowBreachStage,
} from 'src/medical-question/medical-question.events';

export interface MedicalQuestionResponse {
  id: string;
  concern: string;
  symptoms: string;
  gender: Gender;
  age: number;
  isEmergency: boolean;
  status: MedicalQuestionStatus;
  askedAt: string;
  answer: { text: string; answeredAt: string; disclaimer: string } | null;
}

export type MarkAnsweredResult = 'ANSWERED' | 'ALREADY_RESOLVED' | 'NOT_FOUND';

@Injectable()
export class MedicalQuestionService {
  constructor(
    @Inject(MEDICAL_QUESTION_REPOSITORY)
    private readonly repository: MedicalQuestionRepository,
    @Inject(EVENT_PUBLISHER)
    private readonly events: EventPublisher,
  ) {}

  /**
   * An emergency question is written as already `ANSWERED`, with the canned
   * urgent-care text, in the same request — no job, no doctor involved. That
   * is also what keeps it out of the escalation/notification sweeps below:
   * both only ever select rows where `answeredAt IS NULL`.
   */
  async ask(
    userId: string,
    dto: AskMedicalQuestionDto,
    now: Date = new Date(),
  ): Promise<MedicalQuestionResponse> {
    const isEmergency = dto.isEmergency;
    const question = await this.repository.create({
      userId,
      concern: dto.concern,
      symptoms: dto.symptoms,
      gender: dto.gender,
      age: dto.age,
      isEmergency,
      status: isEmergency
        ? MedicalQuestionStatus.ANSWERED
        : MedicalQuestionStatus.PENDING,
      askedAt: now,
      answerText: isEmergency ? EMERGENCY_CANNED_RESPONSE_TEXT : null,
      answeredAt: isEmergency ? now : null,
    });

    this.events.emit(MEDICAL_QUESTION_ASKED_EVENT, {
      questionId: question.id,
      userId,
      isEmergency,
      askedAt: now.toISOString(),
    } satisfies MedicalQuestionAskedEvent);
    if (isEmergency) {
      this.events.emit(MEDICAL_QUESTION_ANSWERED_EVENT, {
        questionId: question.id,
        userId,
        answeredAt: now.toISOString(),
      } satisfies MedicalQuestionAnsweredEvent);
    }

    return this.toResponse(question);
  }

  async list(
    userId: string,
    page: number,
    limit: number,
  ): Promise<Paginated<MedicalQuestionResponse>> {
    const [rows, total] = await this.repository.findPageForUser(
      userId,
      page,
      limit,
    );
    return paginate(
      rows.map((row) => this.toResponse(row)),
      total,
      page,
      limit,
    );
  }

  async get(userId: string, id: string): Promise<MedicalQuestionResponse> {
    const question = await this.findOwnedQuestion(userId, id);
    return this.toResponse(question);
  }

  async delete(userId: string, id: string): Promise<{ deleted: true }> {
    const deleted = await this.repository.softDelete(id, userId);
    if (!deleted) throw new NotFoundException('Question not found');
    return { deleted: true };
  }

  /**
   * Called by the inbound answer listener. Three outcomes, kept distinct so
   * the listener can treat them correctly: a genuine first answer emits the
   * domain event; an already-answered or deleted question is a harmless
   * no-op (covers redelivery, and a patient deleting a question before the
   * doctor replies); an unknown id is a real integration problem the caller
   * must surface, not swallow.
   */
  async markAnswered(
    questionId: string,
    answerText: string,
    answeredAt: Date,
  ): Promise<MarkAnsweredResult> {
    const updated = await this.repository.markAnswered(
      questionId,
      answerText,
      answeredAt,
    );
    if (updated) {
      this.events.emit(MEDICAL_QUESTION_ANSWERED_EVENT, {
        questionId: updated.id,
        userId: updated.userId,
        answeredAt: answeredAt.toISOString(),
      } satisfies MedicalQuestionAnsweredEvent);
      return 'ANSWERED';
    }

    const known = await this.repository.exists(questionId);
    return known ? 'ALREADY_RESOLVED' : 'NOT_FOUND';
  }

  async reapEscalations(now: Date = new Date()): Promise<number> {
    const rows = await this.repository.sweepEscalations(
      new Date(now.getTime() - ESCALATE_AFTER_MS),
      SWEEP_BATCH_SIZE,
    );
    this.emitBreach(rows, 'escalated', now);
    return rows.length;
  }

  async reapNotifications(now: Date = new Date()): Promise<number> {
    const rows = await this.repository.sweepNotifications(
      new Date(now.getTime() - NOTIFY_AFTER_MS),
      SWEEP_BATCH_SIZE,
    );
    this.emitBreach(rows, 'patient_notified', now);
    return rows.length;
  }

  private async findOwnedQuestion(
    userId: string,
    id: string,
  ): Promise<MedicalQuestion> {
    const question = await this.repository.findByIdForUser(id, userId);
    if (!question) throw new NotFoundException('Question not found');
    return question;
  }

  private emitBreach(
    rows: MedicalQuestion[],
    stage: QuestionAnswerWindowBreachStage,
    now: Date,
  ): void {
    for (const row of rows) {
      this.events.emit(QUESTION_ANSWER_WINDOW_BREACHED_EVENT, {
        questionId: row.id,
        userId: row.userId,
        askedAt: row.askedAt.toISOString(),
        stage,
        at: now.toISOString(),
      } satisfies QuestionAnswerWindowBreachedEvent);
    }
  }

  private toResponse(question: MedicalQuestion): MedicalQuestionResponse {
    return {
      id: question.id,
      concern: question.concern,
      symptoms: question.symptoms,
      gender: question.gender,
      age: question.age,
      isEmergency: question.isEmergency,
      status: question.status,
      askedAt: question.askedAt.toISOString(),
      answer:
        question.answerText && question.answeredAt
          ? {
              text: question.answerText,
              answeredAt: question.answeredAt.toISOString(),
              disclaimer: MEDICAL_DISCLAIMER_TEXT,
            }
          : null,
    };
  }
}
