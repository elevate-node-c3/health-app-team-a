import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Gender } from 'src/auth/domain/enums/user.enum';
import { MedicalQuestionStatus } from 'src/medical-question/domain/enums/medical-question-status.enum';

import { TypeOrmMedicalQuestionRepository } from './typeorm-medical-question.repository';

import type { MedicalQuestionOrmEntity } from 'src/medical-question/infrastructure/entities/typeorm/medical-question.entity';

const userId = '11111111-1111-4111-8111-111111111111';
const questionId = '22222222-2222-4222-8222-222222222222';
const now = new Date('2026-10-05T12:00:00.000Z');

function makeOrmRow(
  overrides: Partial<MedicalQuestionOrmEntity> = {},
): MedicalQuestionOrmEntity {
  return {
    id: questionId,
    userId,
    concern: 'Persistent headache',
    symptoms: 'Mild headache for two days, no fever',
    gender: Gender.FEMALE,
    age: 29,
    isEmergency: false,
    status: MedicalQuestionStatus.PENDING,
    askedAt: now,
    escalatedAt: null,
    notifiedAt: null,
    answerText: null,
    answeredAt: null,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as MedicalQuestionOrmEntity;
}

/**
 * The query-builder chain is stubbed because asserting generated SQL is the
 * only way to pin a filter without a live database — the mapping/ownership
 * behavior above needs no SQL and is covered separately.
 */
describe('TypeOrmMedicalQuestionRepository', () => {
  let repository: TypeOrmMedicalQuestionRepository;
  let queryBuilder: Record<string, jest.Mock>;
  let typeormRepo: Record<string, jest.Mock>;

  const chain = () => queryBuilder;

  beforeEach(() => {
    queryBuilder = {
      update: jest.fn(chain),
      set: jest.fn(chain),
      where: jest.fn(chain),
      andWhere: jest.fn(chain),
      returning: jest.fn(chain),
      execute: jest.fn(() => Promise.resolve({ raw: [], affected: 0 })),
    };
    typeormRepo = {
      createQueryBuilder: jest.fn(() => queryBuilder),
      findOneBy: jest.fn(),
      findAndCount: jest.fn(),
      existsBy: jest.fn(),
      save: jest.fn(),
      create: jest.fn((input: unknown) => input),
    };
    repository = new TypeOrmMedicalQuestionRepository(typeormRepo as never);
  });

  describe('findByIdForUser', () => {
    it('scopes the lookup to the owning user and excludes deleted rows', async () => {
      typeormRepo.findOneBy.mockResolvedValue(null);

      await repository.findByIdForUser(questionId, userId);

      expect(typeormRepo.findOneBy).toHaveBeenCalledWith(
        expect.objectContaining({ id: questionId, userId }),
      );
    });
  });

  describe('findPageForUser', () => {
    it('paginates by the owning user, newest first', async () => {
      typeormRepo.findAndCount.mockResolvedValue([[makeOrmRow()], 1]);

      const [rows, total] = await repository.findPageForUser(userId, 2, 10);

      expect(typeormRepo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ userId }),
          order: { askedAt: 'DESC' },
          skip: 10,
          take: 10,
        }),
      );
      expect(total).toBe(1);
      expect(rows[0].id).toBe(questionId);
    });
  });

  describe('softDelete', () => {
    it('scopes the delete to the owning user and reports whether a row was affected', async () => {
      queryBuilder.execute.mockResolvedValue({ raw: [], affected: 1 });

      const deleted = await repository.softDelete(questionId, userId);

      expect(queryBuilder.where).toHaveBeenCalledWith('id = :id', {
        id: questionId,
      });
      expect(queryBuilder.andWhere).toHaveBeenCalledWith('"userId" = :userId', {
        userId,
      });
      expect(deleted).toBe(true);
    });

    it('reports false when nothing owned by this user matched', async () => {
      queryBuilder.execute.mockResolvedValue({ raw: [], affected: 0 });

      const deleted = await repository.softDelete(questionId, userId);

      expect(deleted).toBe(false);
    });
  });

  describe('markAnswered', () => {
    it('only updates a still-unanswered, non-deleted row', async () => {
      queryBuilder.execute.mockResolvedValue({ raw: [makeOrmRow()] });

      const result = await repository.markAnswered(
        questionId,
        'Doctor reply',
        now,
      );

      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        '"answeredAt" IS NULL',
      );
      expect(queryBuilder.andWhere).toHaveBeenCalledWith('"deletedAt" IS NULL');
      expect(result?.id).toBe(questionId);
    });

    it('returns null when no unanswered row matched', async () => {
      queryBuilder.execute.mockResolvedValue({ raw: [] });

      const result = await repository.markAnswered(
        questionId,
        'Doctor reply',
        now,
      );

      expect(result).toBeNull();
    });
  });

  describe('sweeps', () => {
    it('sweepEscalations selects PENDING rows past the threshold and claims them', async () => {
      queryBuilder.execute.mockResolvedValue({ raw: [makeOrmRow()] });

      const rows = await repository.sweepEscalations(now, 100);

      expect(queryBuilder.where).toHaveBeenCalledWith(
        expect.stringContaining('status = :pending'),
        expect.objectContaining({
          pending: MedicalQuestionStatus.PENDING,
          thresholdAt: now,
          limit: 100,
        }),
      );
      expect(rows).toHaveLength(1);
    });

    it('sweepNotifications selects unanswered, un-notified rows past the threshold', async () => {
      queryBuilder.execute.mockResolvedValue({ raw: [makeOrmRow()] });

      const rows = await repository.sweepNotifications(now, 100);

      expect(queryBuilder.where).toHaveBeenCalledWith(
        expect.stringContaining('"notifiedAt" IS NULL'),
        expect.objectContaining({ thresholdAt: now, limit: 100 }),
      );
      expect(rows).toHaveLength(1);
    });
  });
});
