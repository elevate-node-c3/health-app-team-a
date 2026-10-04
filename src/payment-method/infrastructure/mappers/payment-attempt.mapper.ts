import { PaymentAttempt } from 'src/payment-method/domain/entities/payment-attempt.model';

import type { PaymentAttemptOrmEntity } from 'src/payment-method/infrastructure/entities/typeorm/payment-attempt.entity';

export class PaymentAttemptMapper {
  static toDomain(ormEntity: PaymentAttemptOrmEntity): PaymentAttempt {
    return new PaymentAttempt(
      ormEntity.id,
      ormEntity.userId,
      ormEntity.holdId,
      ormEntity.paymentMethodId,
      ormEntity.providerRef,
      ormEntity.idempotencyKey,
      // Money from a `numeric` column: kept as the string the driver returns,
      // because it is quoted to the provider verbatim.
      ormEntity.amount,
      ormEntity.currency,
      ormEntity.status,
      ormEntity.providerPaymentId,
      ormEntity.appointmentId,
      ormEntity.createdAt,
      ormEntity.updatedAt,
    );
  }
}
