import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';

import { PaymentAttemptStatus } from './domain/enums/payment-attempt-status.enum';
import { PAYMENT_ATTEMPT_REPOSITORY } from './domain/repositories/payment-attempt.repository';
import { PaymentChargeService } from './payment-charge.service';

import type { PaymentAttemptRepository } from './domain/repositories/payment-attempt.repository';

const PAYMENT_RECONCILIATION_INTERVAL_MS = 30_000;

/** Attempts per sweep, so one slow batch cannot stall the next. */
const RECONCILIATION_BATCH_SIZE = 25;

/**
 * The safety net behind every payment.
 *
 * A request can die between charging the card and recording the booking — the
 * process restarts, the provider times out, the slot is taken. This loop finds
 * attempts left PROCESSING or REFUND_PENDING and asks the charge service to
 * finish them, which is why `resolveAttempt` is written to be re-runnable.
 *
 * Without this, an interrupted request would leave a patient charged with no
 * appointment and nothing watching.
 */
@Injectable()
export class PaymentReconciliationService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PaymentReconciliationService.name);
  private reconciliationTimer?: NodeJS.Timeout;

  constructor(
    @Inject(PAYMENT_ATTEMPT_REPOSITORY)
    private readonly attemptRepository: PaymentAttemptRepository,
    private readonly chargeService: PaymentChargeService,
  ) {}

  onModuleInit(): void {
    this.reconciliationTimer = setInterval(() => {
      void this.reconcilePayments().catch((error: unknown) => {
        this.logger.error('Payment reconciliation failed', error);
      });
    }, PAYMENT_RECONCILIATION_INTERVAL_MS);
    // Unreferenced so the timer never holds the process open on shutdown.
    this.reconciliationTimer.unref();
  }

  onModuleDestroy(): void {
    if (this.reconciliationTimer) clearInterval(this.reconciliationTimer);
  }

  /**
   * Oldest-first, so a repeatedly failing attempt cannot starve the queue
   * behind it.
   */
  async reconcilePayments(): Promise<void> {
    const pending = await this.attemptRepository.findUnfinished(
      [PaymentAttemptStatus.PROCESSING, PaymentAttemptStatus.REFUND_PENDING],
      RECONCILIATION_BATCH_SIZE,
    );

    for (const attempt of pending)
      await this.chargeService.resolveAttempt(attempt);
  }
}
