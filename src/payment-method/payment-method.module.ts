import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppointmentModule } from 'src/appointment/appointment.module';
import { AuthModule } from 'src/auth/auth.module';
import { OutboxEventOrmEntity } from 'src/infrastructure/database/entities/outbox-event.entity';

import { PAYMENT_METHOD_REPOSITORY } from './domain/repositories/payment-method.repository';
import { PAYMENT_PROVIDER } from './domain/services/payment-provider.port';
import { PaymentAttemptOrmEntity } from './infrastructure/entities/typeorm/payment-attempt.entity';
import { PaymentMethodOrmEntity } from './infrastructure/entities/typeorm/payment-method.entity';
import { PaymentSessionOrmEntity } from './infrastructure/entities/typeorm/payment-session.entity';
import { TypeOrmPaymentMethodRepository } from './infrastructure/repositories/typeorm-payment-method.repository';
import { StripePaymentProviderAdapter } from './infrastructure/services/stripe-payment-provider.adapter';
import { PaymentMethodController } from './payment-method.controller';
import { PaymentMethodService } from './payment-method.service';
import { PaymentWebhookController } from './payment-webhook.controller';

@Module({
  imports: [
    AppointmentModule,
    AuthModule,
    ConfigModule,
    TypeOrmModule.forFeature([
      PaymentMethodOrmEntity,
      PaymentAttemptOrmEntity,
      PaymentSessionOrmEntity,
      OutboxEventOrmEntity,
    ]),
  ],
  controllers: [PaymentMethodController, PaymentWebhookController],
  providers: [
    PaymentMethodService,
    {
      provide: PAYMENT_METHOD_REPOSITORY,
      useClass: TypeOrmPaymentMethodRepository,
    },
    { provide: PAYMENT_PROVIDER, useClass: StripePaymentProviderAdapter },
  ],
  exports: [PAYMENT_METHOD_REPOSITORY, PAYMENT_PROVIDER],
})
export class PaymentMethodModule {}
