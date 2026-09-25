import { PaymentMethodOrmEntity } from '../entities/typeorm/payment-method.entity';

import { PaymentMethod } from '@/payment-method/domain/entities/payment-method.model';

export class PaymentMethodMapper {
  static toDomain(paymentMethodEntity: PaymentMethodOrmEntity) {
    return new PaymentMethod(
      paymentMethodEntity.id,
      paymentMethodEntity.userId,
      paymentMethodEntity.providerRef,
      paymentMethodEntity.brand,
      paymentMethodEntity.last4,
      paymentMethodEntity.holderName,
      paymentMethodEntity.expiryMonth,
      paymentMethodEntity.expiryYear,
      paymentMethodEntity.createdAt,
      paymentMethodEntity.updatedAt,
    );
  }
}
