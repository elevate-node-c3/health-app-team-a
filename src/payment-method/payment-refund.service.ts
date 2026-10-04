import { Inject, Injectable, Logger } from '@nestjs/common';
import { AppointmentBookingService } from 'src/appointment/appointment-booking.service';

import { PaymentAttemptStatus } from './domain/enums/payment-attempt-status.enum';
import { PaymentSessionStatus } from './domain/enums/payment-session-status.enum';
import { PAYMENT_UNIT_OF_WORK } from './domain/repositories/unit-of-work';
import { PAYMENT_PROVIDER } from './domain/services/payment-provider.port';
import {
  failedPaymentResponse,
  processingPaymentResponse,
} from './payment-response';
import { PAYMENT_FAILED_EVENT } from './payment.events';

import type { PaymentAttempt } from './domain/entities/payment-attempt.model';
import type { PaymentUnitOfWork } from './domain/repositories/unit-of-work';
import type {
  ChargeResult,
  PaymentProvider,
} from './domain/services/payment-provider.port';

/** The states from which moving to REFUND_PENDING is still correct. */
const REFUNDABLE_FROM = [
  PaymentAttemptStatus.PROCESSING,
  PaymentAttemptStatus.FAILED,
];

/**
 * Giving money back when a charge succeeded but the booking cannot be honoured.
 *
 * Refunds are their own state machine because they must survive a provider that
 * is slow, flaky, or unreachable: every path here either reaches REFUNDED or
 * parks the attempt in REFUND_PENDING for the reconciliation loop to retry. It
 * never reports success it has not confirmed.
 */
@Injectable()
export class PaymentRefundService {
  private readonly logger = new Logger(PaymentRefundService.name);

  constructor(
    @Inject(PAYMENT_PROVIDER)
    private readonly paymentProvider: PaymentProvider,
    @Inject(PAYMENT_UNIT_OF_WORK)
    private readonly unitOfWork: PaymentUnitOfWork,
    private readonly appointmentBookingService: AppointmentBookingService,
  ) {}

  /**
   * The money was taken but the slot is gone. Refund it if the provider
   * confirms; otherwise record REFUND_PENDING so reconciliation retries, and
   * report "processing" rather than claiming a refund that may not have landed.
   */
  async refundUnavailableBooking(
    attempt: PaymentAttempt,
    result: ChargeResult,
  ): Promise<Record<string, unknown>> {
    try {
      const refunded = await this.paymentProvider.refund(
        result.providerPaymentId,
        `refund:${attempt.id}`,
      );
      if (refunded) {
        await this.markRefunded(attempt.id, result.providerPaymentId);
        return failedPaymentResponse();
      }
    } catch {
      this.logger.warn(`Refund for payment ${attempt.id} is not confirmed`);
    }

    await this.unitOfWork.execute(async (repos) => {
      // Guarded by status so a concurrent success cannot be dragged backwards
      // into REFUND_PENDING.
      const moved = await repos.attempts.markRefundPendingFrom(
        attempt.id,
        REFUNDABLE_FROM,
        result.providerPaymentId,
      );
      if (moved)
        await repos.sessions.updateStatus(attempt.id, {
          status: PaymentSessionStatus.REFUND_PENDING,
          stripePaymentIntentId: result.providerPaymentId,
        });
    });

    return processingPaymentResponse();
  }

  /** Another go at an attempt already parked in REFUND_PENDING. */
  async retryRefund(attempt: PaymentAttempt): Promise<Record<string, unknown>> {
    if (!attempt.providerPaymentId) return processingPaymentResponse();

    try {
      const refunded = await this.paymentProvider.refund(
        attempt.providerPaymentId,
        `refund:${attempt.id}`,
      );
      if (refunded) {
        await this.markRefunded(attempt.id, attempt.providerPaymentId);
        return failedPaymentResponse();
      }
    } catch {
      this.logger.warn(`Refund for payment ${attempt.id} is not confirmed`);
    }

    return processingPaymentResponse();
  }

  /**
   * Settles a confirmed refund: the attempt fails, the held slot is released,
   * and the patient is told. Bails out on a SUCCEEDED attempt, which means a
   * concurrent booking won the race and the money is legitimately kept.
   */
  private async markRefunded(
    attemptId: string,
    providerPaymentId: string,
  ): Promise<void> {
    await this.unitOfWork.execute(async (repos) => {
      const attempt = await repos.attempts.findByIdForUpdate(attemptId);
      if (!attempt || attempt.isSucceeded()) return;

      await repos.attempts.recordOutcome(attempt.id, {
        status: PaymentAttemptStatus.FAILED,
        providerPaymentId,
      });
      await this.appointmentBookingService.releaseHold(
        repos.appointment,
        attempt.holdId,
      );
      await repos.sessions.updateStatus(attempt.id, {
        status: PaymentSessionStatus.REFUNDED,
        stripePaymentIntentId: providerPaymentId,
        appointmentId: null,
        failureReason: 'BOOKING_UNAVAILABLE_REFUNDED',
      });
      await repos.appendEvent(PAYMENT_FAILED_EVENT, {
        userId: attempt.userId,
        paymentAttemptId: attempt.id,
        amount: attempt.amount,
        currency: attempt.currency,
        reason: 'BOOKING_UNAVAILABLE_REFUNDED',
      });
    });
  }
}
