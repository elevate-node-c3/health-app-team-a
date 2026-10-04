import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AppointmentBookingService } from 'src/appointment/appointment-booking.service';

import { PaymentAttemptStatus } from './domain/enums/payment-attempt-status.enum';
import { PaymentSessionStatus } from './domain/enums/payment-session-status.enum';
import { PAYMENT_UNIT_OF_WORK } from './domain/repositories/unit-of-work';
import { PaymentRefundService } from './payment-refund.service';
import {
  failedPaymentResponse,
  processingPaymentResponse,
} from './payment-response';
import {
  APPOINTMENT_BOOKED_EVENT,
  PAYMENT_FAILED_EVENT,
  PAYMENT_SUCCEEDED_EVENT,
} from './payment.events';

import type { PaymentAttempt } from './domain/entities/payment-attempt.model';
import type { PaymentUnitOfWork } from './domain/repositories/unit-of-work';
import type { ChargeResult } from './domain/services/payment-provider.port';

/** What settling an attempt produced, so the caller can shape its response. */
export interface SettlementOutcome {
  attempt: PaymentAttempt;
  /** Set when settlement could not complete and already has its own answer. */
  response?: Record<string, unknown>;
}

/**
 * Writes a known provider outcome into the database.
 *
 * Split from `PaymentChargeService` so that deciding *what* an outcome means
 * stays separate from *applying* it. Both methods here re-read the attempt
 * under a row lock and bail if it has already been settled, because the charge
 * path, the reconciliation timer and the provider webhook can all arrive with
 * the same outcome at once.
 */
@Injectable()
export class PaymentSettlementService {
  private readonly logger = new Logger(PaymentSettlementService.name);

  constructor(
    @Inject(PAYMENT_UNIT_OF_WORK)
    private readonly unitOfWork: PaymentUnitOfWork,
    private readonly appointmentBookingService: AppointmentBookingService,
    private readonly refundService: PaymentRefundService,
  ) {}

  /**
   * The successful path: book the held slot, mark the attempt succeeded, and
   * queue the notification events — all in one transaction, so a patient is
   * never charged for an appointment that was not written.
   */
  async finalizeBooking(
    attempt: PaymentAttempt,
    result: ChargeResult,
  ): Promise<SettlementOutcome> {
    try {
      const finalized = await this.unitOfWork.execute(async (repos) => {
        const locked = await repos.attempts.findByIdForUpdate(attempt.id);
        if (!locked) throw new NotFoundException('Payment attempt not found');
        // Already settled by a concurrent caller; leave it alone.
        if (locked.isSettled()) return locked;

        const booked = await this.appointmentBookingService.bookClaimedHold(
          repos.appointment,
          locked.holdId,
        );

        await repos.attempts.recordOutcome(locked.id, {
          status: PaymentAttemptStatus.SUCCEEDED,
          providerPaymentId: result.providerPaymentId,
          appointmentId: booked.appointment.id,
        });
        await repos.sessions.updateStatus(locked.id, {
          status: PaymentSessionStatus.SUCCEEDED,
          stripePaymentIntentId: result.providerPaymentId,
          appointmentId: booked.appointment.id,
        });

        const eventPayload = {
          userId: locked.userId,
          paymentAttemptId: locked.id,
          appointmentId: booked.appointment.id,
          scheduledAt: booked.appointment.scheduledAt.toISOString(),
          doctorName: booked.doctorName,
          clinicName: booked.clinicName,
          amount: locked.amount,
          currency: locked.currency,
        };
        await repos.appendEvent(PAYMENT_SUCCEEDED_EVENT, eventPayload);
        await repos.appendEvent(APPOINTMENT_BOOKED_EVENT, eventPayload);

        // Mirrored onto the in-memory object so the caller's receipt reads the
        // committed state without another query.
        locked.status = PaymentAttemptStatus.SUCCEEDED;
        locked.providerPaymentId = result.providerPaymentId;
        locked.appointmentId = booked.appointment.id;
        return locked;
      });

      return finalized.isSucceeded()
        ? { attempt: finalized }
        : { attempt: finalized, response: failedPaymentResponse() };
    } catch (error) {
      // The slot went while the charge was in flight - refund rather than
      // keeping money for a booking that cannot exist.
      if (error instanceof ConflictException)
        return {
          attempt,
          response: await this.refundService.refundUnavailableBooking(
            attempt,
            result,
          ),
        };

      this.logger.error(
        `Payment ${attempt.id} succeeded at the provider but booking finalization failed; reconciliation will retry`,
        error,
      );
      return { attempt, response: processingPaymentResponse() };
    }
  }

  /** The declined path: fail the attempt and give the held slot back. */
  async recordDecline(
    attempt: PaymentAttempt,
    result: ChargeResult,
  ): Promise<void> {
    await this.unitOfWork.execute(async (repos) => {
      const locked = await repos.attempts.findByIdForUpdate(attempt.id);
      if (!locked?.isProcessing()) return;

      await repos.attempts.recordOutcome(locked.id, {
        status: PaymentAttemptStatus.FAILED,
        providerPaymentId: result.providerPaymentId,
      });
      await this.appointmentBookingService.releaseHold(
        repos.appointment,
        locked.holdId,
      );
      await repos.sessions.updateStatus(locked.id, {
        status: PaymentSessionStatus.FAILED,
        stripePaymentIntentId: result.providerPaymentId,
        appointmentId: null,
        failureReason: 'Payment declined',
      });
      await repos.appendEvent(PAYMENT_FAILED_EVENT, {
        userId: locked.userId,
        paymentAttemptId: locked.id,
        amount: locked.amount,
        currency: locked.currency,
      });
    });
  }
}
