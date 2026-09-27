import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from 'src/auth/auth.module';

import { PAYMENT_METHOD_REPOSITORY } from './domain/repositories/payment-method.repository';
import { PAYMENT_PROVIDER } from './domain/services/payment-provider.port';
import { PaymentMethodOrmEntity } from './infrastructure/entities/typeorm/payment-method.entity';
import { TypeOrmPaymentMethodRepository } from './infrastructure/repositories/typeorm-payment-method.repository';
import { FakePaymentProviderAdapter } from './infrastructure/services/fake-payment-provider.adapter';
import { PaymentMethodController } from './payment-method.controller';
import { PaymentMethodService } from './payment-method.service';

@Module({
  imports: [AuthModule, TypeOrmModule.forFeature([PaymentMethodOrmEntity])],
  controllers: [PaymentMethodController],
  providers: [
    PaymentMethodService,
    {
      provide: PAYMENT_METHOD_REPOSITORY,
      useClass: TypeOrmPaymentMethodRepository,
    },
    { provide: PAYMENT_PROVIDER, useClass: FakePaymentProviderAdapter },
  ],
  exports: [PAYMENT_METHOD_REPOSITORY, PAYMENT_PROVIDER],
})
export class PaymentMethodModule {}
