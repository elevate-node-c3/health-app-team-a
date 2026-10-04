import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PaymentAttemptStatus } from 'src/payment-method/domain/enums/payment-attempt-status.enum';
import { PaymentAttemptOrmEntity } from 'src/payment-method/infrastructure/entities/typeorm/payment-attempt.entity';
import { PaymentAttemptMapper } from 'src/payment-method/infrastructure/mappers/payment-attempt.mapper';
import { In, Repository } from 'typeorm';

import type { PaymentAttempt } from 'src/payment-method/domain/entities/payment-attempt.model';
import type {
  CreatePaymentAttemptInput,
  PaymentAttemptOutcome,
  PaymentAttemptRepository,
} from 'src/payment-method/domain/repositories/payment-attempt.repository';

@Injectable()
export class TypeOrmPaymentAttemptRepository implements PaymentAttemptRepository {
  constructor(
    @InjectRepository(PaymentAttemptOrmEntity)
    private readonly attemptRepo: Repository<PaymentAttemptOrmEntity>,
  ) {}

  async create(input: CreatePaymentAttemptInput): Promise<PaymentAttempt> {
    const saved = await this.attemptRepo.save(
      this.attemptRepo.create({
        ...input,
        status: PaymentAttemptStatus.PROCESSING,
        providerPaymentId: null,
        appointmentId: null,
      }),
    );
    return PaymentAttemptMapper.toDomain(saved);
  }

  async findByIdempotencyKey(
    userId: string,
    idempotencyKey: string,
  ): Promise<PaymentAttempt | null> {
    const row = await this.attemptRepo.findOneBy({ userId, idempotencyKey });
    return row ? PaymentAttemptMapper.toDomain(row) : null;
  }

  async findById(id: string): Promise<PaymentAttempt | null> {
    const row = await this.attemptRepo.findOneBy({ id });
    return row ? PaymentAttemptMapper.toDomain(row) : null;
  }

  findByIdForUpdate(id: string): Promise<PaymentAttempt | null> {
    return this.findOneLocked({ id });
  }

  findByIdempotencyKeyForUpdate(
    userId: string,
    idempotencyKey: string,
  ): Promise<PaymentAttempt | null> {
    return this.findOneLocked({ userId, idempotencyKey });
  }

  findSucceededForAppointmentForUpdate(
    appointmentId: string,
    userId: string,
  ): Promise<PaymentAttempt | null> {
    return this.findOneLocked({
      appointmentId,
      userId,
      status: PaymentAttemptStatus.SUCCEEDED,
    });
  }

  async recordOutcome(
    id: string,
    outcome: PaymentAttemptOutcome,
  ): Promise<void> {
    // Undefined keys are dropped rather than handed to TypeORM, so "leave this
    // column alone" never becomes "write NULL into it".
    const update = Object.fromEntries(
      Object.entries(outcome).filter(([, value]) => value !== undefined),
    ) as PaymentAttemptOutcome;

    await this.attemptRepo.update({ id }, update);
  }

  async markRefundPendingFrom(
    id: string,
    allowedFrom: PaymentAttemptStatus[],
    providerPaymentId: string,
  ): Promise<boolean> {
    // The status predicate is the guard: a compare-and-set, so an attempt that
    // succeeded concurrently is left alone rather than reopened for refund.
    const result = await this.attemptRepo.update(
      { id, status: In(allowedFrom) },
      { status: PaymentAttemptStatus.REFUND_PENDING, providerPaymentId },
    );

    return (result.affected ?? 0) > 0;
  }

  async findUnfinished(
    statuses: PaymentAttemptStatus[],
    limit: number,
  ): Promise<PaymentAttempt[]> {
    const rows = await this.attemptRepo.find({
      where: { status: In(statuses) },
      order: { updatedAt: 'ASC' },
      take: limit,
    });
    return rows.map((row) => PaymentAttemptMapper.toDomain(row));
  }

  private async findOneLocked(
    where: Record<string, unknown>,
  ): Promise<PaymentAttempt | null> {
    const row = await this.attemptRepo.findOne({
      where,
      lock: { mode: 'pessimistic_write' },
    });
    return row ? PaymentAttemptMapper.toDomain(row) : null;
  }
}
