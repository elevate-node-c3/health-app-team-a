import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppointmentModule } from 'src/appointment/appointment.module';
import { AuthModule } from 'src/auth/auth.module';
import { BookingConfirmationEmailListener } from 'src/common/services/mail/booking-confirmation-email.listener';
import { OutboxEventOrmEntity } from 'src/infrastructure/database/entities/outbox-event.entity';

import { PAYMENT_ATTEMPT_REPOSITORY } from './domain/repositories/payment-attempt.repository';
import { PAYMENT_METHOD_REPOSITORY } from './domain/repositories/payment-method.repository';
import { PAYMENT_SESSION_REPOSITORY } from './domain/repositories/payment-session.repository';
import { PAYMENT_UNIT_OF_WORK } from './domain/repositories/unit-of-work';
import { PAYMENT_PROVIDER } from './domain/services/payment-provider.port';
import { PaymentAttemptOrmEntity } from './infrastructure/entities/typeorm/payment-attempt.entity';
import { PaymentMethodOrmEntity } from './infrastructure/entities/typeorm/payment-method.entity';
import { PaymentSessionOrmEntity } from './infrastructure/entities/typeorm/payment-session.entity';
import { TypeOrmPaymentAttemptRepository } from './infrastructure/repositories/typeorm-payment-attempt.repository';
import { TypeOrmPaymentMethodRepository } from './infrastructure/repositories/typeorm-payment-method.repository';
import { TypeOrmPaymentSessionRepository } from './infrastructure/repositories/typeorm-payment-session.repository';
import { StripePaymentProviderAdapter } from './infrastructure/services/stripe-payment-provider.adapter';
import { TypeOrmPaymentUnitOfWork } from './infrastructure/unit-of-work/typeorm-unit-of-work';
import { PaymentChargeService } from './payment-charge.service';
import { PaymentMethodController } from './payment-method.controller';
import { PaymentMethodService } from './payment-method.service';
import { PaymentReconciliationService } from './payment-reconciliation.service';
import { PaymentRefundService } from './payment-refund.service';
import { PaymentSettlementService } from './payment-settlement.service';
import { PaymentWebhookController } from './payment-webhook.controller';
import { PaymentWebhookService } from './payment-webhook.service';

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
    // Card management, then the charge pipeline built on top of it:
    // charge -> refund, with reconciliation and the webhook both driving
    // charge. No cycles among them.
    PaymentMethodService,
    PaymentRefundService,
    PaymentSettlementService,
    PaymentChargeService,
    PaymentReconciliationService,
    PaymentWebhookService,
    {
      provide: PAYMENT_METHOD_REPOSITORY,
      useClass: TypeOrmPaymentMethodRepository,
    },
    {
      provide: PAYMENT_ATTEMPT_REPOSITORY,
      useClass: TypeOrmPaymentAttemptRepository,
    },
    {
      provide: PAYMENT_SESSION_REPOSITORY,
      useClass: TypeOrmPaymentSessionRepository,
    },
    { provide: PAYMENT_PROVIDER, useClass: StripePaymentProviderAdapter },
    { provide: PAYMENT_UNIT_OF_WORK, useClass: TypeOrmPaymentUnitOfWork },
    // Registered here rather than in the global CommonModules: it needs
    // USER_REPOSITORY, which AuthModule exports and this module imports, and
    // it listens for APPOINTMENT_BOOKED_EVENT, which this module raises.
    BookingConfirmationEmailListener,
  ],
  exports: [
    PAYMENT_METHOD_REPOSITORY,
    PAYMENT_ATTEMPT_REPOSITORY,
    PAYMENT_SESSION_REPOSITORY,
    PAYMENT_PROVIDER,
  ],
})
export class PaymentMethodModule {}
