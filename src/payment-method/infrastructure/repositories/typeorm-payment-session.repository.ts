import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PaymentSessionStatus } from 'src/payment-method/domain/enums/payment-session-status.enum';
import { PaymentSessionOrmEntity } from 'src/payment-method/infrastructure/entities/typeorm/payment-session.entity';
import { Repository } from 'typeorm';

import type {
  NewPaymentSession,
  PaymentSessionRepository,
  PaymentSessionStatusChange,
} from 'src/payment-method/domain/repositories/payment-session.repository';

@Injectable()
export class TypeOrmPaymentSessionRepository implements PaymentSessionRepository {
  constructor(
    @InjectRepository(PaymentSessionOrmEntity)
    private readonly sessionRepo: Repository<PaymentSessionOrmEntity>,
  ) {}

  async insert(session: NewPaymentSession): Promise<void> {
    await this.sessionRepo.save(
      this.sessionRepo.create({
        ...session,
        status: PaymentSessionStatus.CREATED,
        stripePaymentIntentId: null,
        appointmentId: null,
        metadata: null,
        failureReason: null,
      }),
    );
  }

  async updateStatus(
    paymentAttemptId: string,
    change: PaymentSessionStatusChange,
  ): Promise<void> {
    // Undefined keys are dropped rather than handed to TypeORM, so "leave this
    // column alone" never becomes "write NULL into it".
    const update = Object.fromEntries(
      Object.entries(change).filter(([, value]) => value !== undefined),
    ) as PaymentSessionStatusChange;

    await this.sessionRepo.update({ paymentAttemptId }, update);
  }
}
