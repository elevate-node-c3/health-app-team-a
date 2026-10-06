import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { NotFoundException } from '@nestjs/common';
import { Gender } from 'src/auth/domain/enums/user.enum';
import {
  MEDICAL_QUESTION_ANSWERED_EVENT,
  MEDICAL_QUESTION_ASKED_EVENT,
  QUESTION_ANSWER_WINDOW_BREACHED_EVENT,
} from 'src/infrastructure/messaging/event-names';

import { MedicalQuestion } from './domain/entities/medical-question.model';
import { MedicalQuestionStatus } from './domain/enums/medical-question-status.enum';
import { AskMedicalQuestionDto } from './dto/ask-medical-question.dto';
import { MedicalQuestionService } from './medical-question.service';

const userId = '11111111-1111-4111-8111-111111111111';
const questionId = '22222222-2222-4222-8222-222222222222';
const now = new Date('2026-10-05T12:00:00.000Z');

function makeQuestion(
  overrides: Partial<{
    status: MedicalQuestionStatus;
    answerText: string | null;
    answeredAt: Date | null;
    isEmergency: boolean;
    askedAt: Date;
  }> = {},
): MedicalQuestion {
  return new MedicalQuestion(
    questionId,
    userId,
    'Persistent headache',
    'Mild headache for two days, no fever',
    Gender.FEMALE,
    29,
    overrides.isEmergency ?? false,
    overrides.status ?? MedicalQuestionStatus.PENDING,
    overrides.askedAt ?? now,
    null,
    null,
    overrides.answerText ?? null,
    overrides.answeredAt ?? null,
    null,
    now,
    now,
  );
}

function makeDto(overrides: Partial<AskMedicalQuestionDto> = {}) {
  const dto = new AskMedicalQuestionDto();
  dto.concern = 'Persistent headache';
  dto.symptoms = 'Mild headache for two days, no fever';
  dto.gender = Gender.FEMALE;
  dto.age = 29;
  dto.isEmergency = false;
  return Object.assign(dto, overrides);
}

describe('MedicalQuestionService', () => {
  let repository: Record<string, jest.Mock>;
  let events: { emit: jest.Mock };
  let service: MedicalQuestionService;

  beforeEach(() => {
    repository = {
      create: jest.fn(),
      findByIdForUser: jest.fn(),
      findPageForUser: jest.fn(),
      softDelete: jest.fn(),
      markAnswered: jest.fn(),
      exists: jest.fn(),
      sweepEscalations: jest.fn(),
      sweepNotifications: jest.fn(),
    };
    events = { emit: jest.fn() };
    service = new MedicalQuestionService(repository as never, events as never);
  });

  describe('ask', () => {
    it('stores a non-emergency question as pending with no answer, and emits only "asked"', async () => {
      repository.create.mockResolvedValue(makeQuestion());

      const result = await service.ask(userId, makeDto(), now);

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
          status: MedicalQuestionStatus.PENDING,
          answerText: null,
          answeredAt: null,
        }),
      );
      expect(result.status).toBe(MedicalQuestionStatus.PENDING);
      expect(result.answer).toBeNull();
      expect(events.emit).toHaveBeenCalledTimes(1);
      expect(events.emit).toHaveBeenCalledWith(
        MEDICAL_QUESTION_ASKED_EVENT,
        expect.objectContaining({ questionId, userId, isEmergency: false }),
      );
    });

    it('resolves an emergency question immediately with the canned response and disclaimer', async () => {
      repository.create.mockResolvedValue(
        makeQuestion({
          isEmergency: true,
          status: MedicalQuestionStatus.ANSWERED,
          answerText: 'urgent-care canned text',
          answeredAt: now,
        }),
      );

      const result = await service.ask(
        userId,
        makeDto({ isEmergency: true }),
        now,
      );

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          status: MedicalQuestionStatus.ANSWERED,
          answerText: expect.any(String),
          answeredAt: now,
        }),
      );
      expect(result.status).toBe(MedicalQuestionStatus.ANSWERED);
      expect(result.answer).not.toBeNull();
      expect(result.answer?.disclaimer).toBeTruthy();
      expect(events.emit).toHaveBeenCalledTimes(2);
      expect(events.emit).toHaveBeenCalledWith(
        MEDICAL_QUESTION_ASKED_EVENT,
        expect.objectContaining({ isEmergency: true }),
      );
      expect(events.emit).toHaveBeenCalledWith(
        MEDICAL_QUESTION_ANSWERED_EVENT,
        expect.objectContaining({ questionId, userId }),
      );
    });
  });

  describe('ownership', () => {
    it('get() 404s when the repository finds nothing owned by this user', async () => {
      repository.findByIdForUser.mockResolvedValue(null);

      await expect(service.get(userId, questionId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('delete() 404s when nothing owned by this user was deleted', async () => {
      repository.softDelete.mockResolvedValue(false);

      await expect(service.delete(userId, questionId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('delete() succeeds when the repository deleted an owned row', async () => {
      repository.softDelete.mockResolvedValue(true);

      await expect(service.delete(userId, questionId)).resolves.toEqual({
        deleted: true,
      });
    });
  });

  describe('markAnswered', () => {
    it('emits "answered" and reports ANSWERED on a genuine first answer', async () => {
      repository.markAnswered.mockResolvedValue(
        makeQuestion({
          status: MedicalQuestionStatus.ANSWERED,
          answerText: 'Doctor reply',
          answeredAt: now,
        }),
      );

      const result = await service.markAnswered(
        questionId,
        'Doctor reply',
        now,
      );

      expect(result).toBe('ANSWERED');
      expect(events.emit).toHaveBeenCalledWith(
        MEDICAL_QUESTION_ANSWERED_EVENT,
        expect.objectContaining({ questionId, userId }),
      );
    });

    it('is a harmless no-op, without an event, when the question is already resolved', async () => {
      repository.markAnswered.mockResolvedValue(null);
      repository.exists.mockResolvedValue(true);

      const result = await service.markAnswered(
        questionId,
        'Doctor reply',
        now,
      );

      expect(result).toBe('ALREADY_RESOLVED');
      expect(events.emit).not.toHaveBeenCalled();
    });

    it('reports NOT_FOUND when the id is entirely unknown', async () => {
      repository.markAnswered.mockResolvedValue(null);
      repository.exists.mockResolvedValue(false);

      const result = await service.markAnswered(
        questionId,
        'Doctor reply',
        now,
      );

      expect(result).toBe('NOT_FOUND');
      expect(events.emit).not.toHaveBeenCalled();
    });
  });

  describe('sweeps', () => {
    it('reapEscalations emits one breach event per swept row, staged "escalated"', async () => {
      repository.sweepEscalations.mockResolvedValue([
        makeQuestion(),
        makeQuestion(),
      ]);

      const count = await service.reapEscalations(now);

      expect(count).toBe(2);
      expect(events.emit).toHaveBeenCalledTimes(2);
      expect(events.emit).toHaveBeenCalledWith(
        QUESTION_ANSWER_WINDOW_BREACHED_EVENT,
        expect.objectContaining({ stage: 'escalated' }),
      );
    });

    it('reapNotifications emits one breach event per swept row, staged "patient_notified"', async () => {
      repository.sweepNotifications.mockResolvedValue([makeQuestion()]);

      const count = await service.reapNotifications(now);

      expect(count).toBe(1);
      expect(events.emit).toHaveBeenCalledWith(
        QUESTION_ANSWER_WINDOW_BREACHED_EVENT,
        expect.objectContaining({ stage: 'patient_notified' }),
      );
    });

    it('emits nothing when a sweep finds no rows', async () => {
      repository.sweepEscalations.mockResolvedValue([]);

      const count = await service.reapEscalations(now);

      expect(count).toBe(0);
      expect(events.emit).not.toHaveBeenCalled();
    });
  });
});
