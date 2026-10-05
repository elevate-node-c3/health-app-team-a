import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MedicalQuestion } from 'src/medical-question/domain/entities/medical-question.model';
import { MedicalQuestionStatus } from 'src/medical-question/domain/enums/medical-question-status.enum';
import {
  CreateMedicalQuestionInput,
  MedicalQuestionRepository,
} from 'src/medical-question/domain/repositories/medical-question.repository';
import { MedicalQuestionOrmEntity } from 'src/medical-question/infrastructure/entities/typeorm/medical-question.entity';
import { MedicalQuestionMapper } from 'src/medical-question/infrastructure/mappers/medical-question.mapper';
import { IsNull, Repository } from 'typeorm';

function toDomainOrNull(
  row: MedicalQuestionOrmEntity | null,
): MedicalQuestion | null {
  return row ? MedicalQuestionMapper.toDomain(row) : null;
}

@Injectable()
export class TypeOrmMedicalQuestionRepository implements MedicalQuestionRepository {
  constructor(
    @InjectRepository(MedicalQuestionOrmEntity)
    private readonly repo: Repository<MedicalQuestionOrmEntity>,
  ) {}

  async create(input: CreateMedicalQuestionInput): Promise<MedicalQuestion> {
    const saved = await this.repo.save(
      this.repo.create({
        ...input,
        escalatedAt: null,
        notifiedAt: null,
        deletedAt: null,
      }),
    );
    return MedicalQuestionMapper.toDomain(saved);
  }

  async findByIdForUser(
    id: string,
    userId: string,
  ): Promise<MedicalQuestion | null> {
    const row = await this.repo.findOneBy({ id, userId, deletedAt: IsNull() });
    return toDomainOrNull(row);
  }

  async findPageForUser(
    userId: string,
    page: number,
    limit: number,
  ): Promise<[MedicalQuestion[], number]> {
    const [rows, total] = await this.repo.findAndCount({
      where: { userId, deletedAt: IsNull() },
      order: { askedAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return [rows.map((row) => MedicalQuestionMapper.toDomain(row)), total];
  }

  async softDelete(id: string, userId: string): Promise<boolean> {
    const result = await this.repo
      .createQueryBuilder()
      .update(MedicalQuestionOrmEntity)
      .set({ deletedAt: () => 'now()' })
      .where('id = :id', { id })
      .andWhere('"userId" = :userId', { userId })
      .andWhere('"deletedAt" IS NULL')
      .execute();

    return (result.affected ?? 0) > 0;
  }

  async markAnswered(
    questionId: string,
    answerText: string,
    answeredAt: Date,
  ): Promise<MedicalQuestion | null> {
    const result = await this.repo
      .createQueryBuilder()
      .update(MedicalQuestionOrmEntity)
      .set({ status: MedicalQuestionStatus.ANSWERED, answerText, answeredAt })
      .where('id = :id', { id: questionId })
      .andWhere('"answeredAt" IS NULL')
      .andWhere('"deletedAt" IS NULL')
      .returning('*')
      .execute();

    return toDomainOrNull(this.firstRow(result.raw));
  }

  exists(id: string): Promise<boolean> {
    return this.repo.existsBy({ id });
  }

  async sweepEscalations(
    thresholdAt: Date,
    limit: number,
  ): Promise<MedicalQuestion[]> {
    const result = await this.repo
      .createQueryBuilder()
      .update(MedicalQuestionOrmEntity)
      .set({
        status: MedicalQuestionStatus.ESCALATED,
        escalatedAt: () => 'now()',
      })
      .where(
        `id IN (SELECT id FROM medical_questions WHERE status = :pending AND "escalatedAt" IS NULL AND "askedAt" <= :thresholdAt AND "deletedAt" IS NULL ORDER BY "askedAt" LIMIT :limit FOR UPDATE SKIP LOCKED)`,
        { pending: MedicalQuestionStatus.PENDING, thresholdAt, limit },
      )
      .returning('*')
      .execute();

    return this.allRows(result.raw).map((row) =>
      MedicalQuestionMapper.toDomain(row),
    );
  }

  async sweepNotifications(
    thresholdAt: Date,
    limit: number,
  ): Promise<MedicalQuestion[]> {
    const result = await this.repo
      .createQueryBuilder()
      .update(MedicalQuestionOrmEntity)
      .set({ notifiedAt: () => 'now()' })
      .where(
        `id IN (SELECT id FROM medical_questions WHERE "answeredAt" IS NULL AND "notifiedAt" IS NULL AND "askedAt" <= :thresholdAt AND "deletedAt" IS NULL ORDER BY "askedAt" LIMIT :limit FOR UPDATE SKIP LOCKED)`,
        { thresholdAt, limit },
      )
      .returning('*')
      .execute();

    return this.allRows(result.raw).map((row) =>
      MedicalQuestionMapper.toDomain(row),
    );
  }

  private firstRow(raw: unknown): MedicalQuestionOrmEntity | null {
    return this.allRows(raw)[0] ?? null;
  }

  private allRows(raw: unknown): MedicalQuestionOrmEntity[] {
    return raw as MedicalQuestionOrmEntity[];
  }
}
