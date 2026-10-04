import { Injectable } from '@nestjs/common';
import { buildAppointmentRepositories } from 'src/appointment/infrastructure/unit-of-work/typeorm-unit-of-work';
import { advisoryXactLock } from 'src/infrastructure/database/advisory-lock';
import { appendOutboxEvent } from 'src/infrastructure/database/outbox';
import { PaymentAttemptOrmEntity } from 'src/payment-method/infrastructure/entities/typeorm/payment-attempt.entity';
import { PaymentSessionOrmEntity } from 'src/payment-method/infrastructure/entities/typeorm/payment-session.entity';
import { TypeOrmPaymentAttemptRepository } from 'src/payment-method/infrastructure/repositories/typeorm-payment-attempt.repository';
import { TypeOrmPaymentSessionRepository } from 'src/payment-method/infrastructure/repositories/typeorm-payment-session.repository';
import { DataSource } from 'typeorm';

import type {
  PaymentTransactionRepositories,
  PaymentUnitOfWork,
} from 'src/payment-method/domain/repositories/unit-of-work';

/**
 * The only place the payment module may call `DataSource.transaction`.
 *
 * The appointment bundle is built by `buildAppointmentRepositories` from the
 * **same** manager rather than being reconstructed here, so a booking written
 * through it commits with the payment attempt that paid for it. Rebuilding the
 * appointment repositories independently is the mistake this import prevents.
 */
@Injectable()
export class TypeOrmPaymentUnitOfWork implements PaymentUnitOfWork {
  constructor(private readonly dataSource: DataSource) {}

  execute<T>(
    work: (repositories: PaymentTransactionRepositories) => Promise<T>,
  ): Promise<T> {
    return this.dataSource.transaction((manager) =>
      work({
        attempts: new TypeOrmPaymentAttemptRepository(
          manager.getRepository(PaymentAttemptOrmEntity),
        ),
        sessions: new TypeOrmPaymentSessionRepository(
          manager.getRepository(PaymentSessionOrmEntity),
        ),
        appointment: buildAppointmentRepositories(manager),
        // The key must stay `payment-idempotency:<user>:<key>` byte for byte -
        // it is the lock identity, shared with any older deployment still
        // serving traffic mid-rollout.
        lockIdempotencyKey: (userId: string, idempotencyKey: string) =>
          advisoryXactLock(
            manager,
            'payment-idempotency',
            `${userId}:${idempotencyKey}`,
          ),
        appendEvent: (eventName, payload) =>
          appendOutboxEvent(manager, eventName, payload),
      }),
    );
  }
}
