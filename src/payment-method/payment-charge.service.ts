import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AppointmentBookingService } from 'src/appointment/appointment-booking.service';
import { APPOINTMENT_REPOSITORY } from 'src/appointment/domain/repositories/appointment.repository';

import { PAYMENT_ATTEMPT_REPOSITORY } from './domain/repositories/payment-attempt.repository';
import { PAYMENT_UNIT_OF_WORK } from './domain/repositories/unit-of-work';
import { PAYMENT_PROVIDER } from './domain/services/payment-provider.port';
import { PaymentMethodService } from './payment-method.service';
import { PaymentRefundService } from './payment-refund.service';
import {
  confirmedPaymentResponse,
  failedPaymentResponse,
  processingPaymentResponse,
} from './payment-response';
import { PaymentSettlementService } from './payment-settlement.service';

import type { PaymentAttempt } from './domain/entities/payment-attempt.model';
import type { PaymentMethod } from './domain/entities/payment-method.model';
import type { PaymentAttemptRepository } from './domain/repositories/payment-attempt.repository';
import type { PaymentUnitOfWork } from './domain/repositories/unit-of-work';
import type {
  ChargeResult,
  PaymentProvider,
} from './domain/services/payment-provider.port';
import type { AppointmentRepository } from 'src/appointment/domain/repositories/appointment.repository';

/** PostgreSQL unique_violation — two requests inserted the same attempt. */
const UNIQUE_VIOLATION = '23505';

const MIN_IDEMPOTENCY_KEY_LENGTH = 8;
const MAX_IDEMPOTENCY_KEY_LENGTH = 128;

/**
 * Charging a card and turning the result into a booking.
 *
 * The invariant the whole class exists to hold: a patient is charged at most
 * once per idempotency key, and money taken always ends as either a booked
 * appointment or a refund. Every path is therefore written to be re-runnable —
 * the reconciliation loop calls `resolveAttempt` again on anything it finds
 * unfinished, and the provider webhook calls `applyProviderResult` with
 * whatever the provider believes.
 */
@Injectable()
export class PaymentChargeService {
  private readonly logger = new Logger(PaymentChargeService.name);

  constructor(
    @Inject(PAYMENT_PROVIDER)
    private readonly paymentProvider: PaymentProvider,
    @Inject(PAYMENT_UNIT_OF_WORK)
    private readonly unitOfWork: PaymentUnitOfWork,
    private readonly appointmentBookingService: AppointmentBookingService,
    private readonly paymentMethodService: PaymentMethodService,
    @Inject(APPOINTMENT_REPOSITORY)
    private readonly appointmentRepository: AppointmentRepository,
    private readonly refundService: PaymentRefundService,
    private readonly settlementService: PaymentSettlementService,
    @Inject(PAYMENT_ATTEMPT_REPOSITORY)
    private readonly attemptRepository: PaymentAttemptRepository,
  ) {}

  async confirmPayment(
    userId: string,
    paymentMethodId: string,
    holdId: string,
    idempotencyKey: string,
    now: Date = new Date(),
  ): Promise<Record<string, unknown>> {
    if (
      idempotencyKey.length < MIN_IDEMPOTENCY_KEY_LENGTH ||
      idempotencyKey.length > MAX_IDEMPOTENCY_KEY_LENGTH
    )
      throw new BadRequestException(
        'A valid Idempotency-Key header is required',
      );

    let attempt = await this.findAttempt(userId, idempotencyKey);
    // Only load the card when no attempt exists: a retry must not fail just
    // because the card has since expired or been deleted.
    let card: PaymentMethod | undefined;
    if (!attempt)
      card = await this.paymentMethodService.getForCharge(
        userId,
        paymentMethodId,
        now,
      );

    try {
      attempt = await this.openAttempt(
        userId,
        paymentMethodId,
        holdId,
        idempotencyKey,
        card,
        now,
      );
    } catch (error) {
      // Lost the insert race: the winner's attempt is the real one, provided it
      // was the same request.
      if ((error as { code?: string }).code !== UNIQUE_VIOLATION) throw error;
      const concurrent = await this.findAttempt(userId, idempotencyKey);
      if (!concurrent) throw error;
      this.assertSameRequest(concurrent, paymentMethodId, holdId);
      attempt = concurrent;
    }

    if (attempt.isSucceeded()) return this.confirmationForAttempt(attempt);
    if (attempt.isFailed()) return failedPaymentResponse();

    return this.resolveAttempt(attempt);
  }

  async getPaymentStatus(
    userId: string,
    idempotencyKey: string,
  ): Promise<Record<string, unknown>> {
    const attempt = await this.findAttempt(userId, idempotencyKey);
    if (!attempt) throw new NotFoundException('Payment attempt not found');

    if (attempt.isSucceeded()) return this.confirmationForAttempt(attempt);
    if (attempt.isFailed()) return failedPaymentResponse();
    return processingPaymentResponse();
  }

  /**
   * Drives one unfinished attempt as far as it will go. Public because both the
   * reconciliation loop and `confirmPayment` need it, and it is safe to call
   * repeatedly: `getCharge` is consulted before charging again, so the provider
   * is never asked to take the money twice.
   */
  async resolveAttempt(
    attempt: PaymentAttempt,
  ): Promise<Record<string, unknown>> {
    if (attempt.isAwaitingRefund())
      return this.refundService.retryRefund(attempt);

    try {
      const result =
        (await this.paymentProvider.getCharge(attempt.id)) ??
        (await this.paymentProvider.charge({
          providerRef: attempt.providerRef,
          amount: attempt.amount,
          currency: attempt.currency,
          idempotencyKey: attempt.id,
        }));
      return this.applyProviderResult(attempt, result);
    } catch {
      // An unknown outcome is the one case where doing nothing is right: the
      // charge may have landed, so reconciliation must look again later.
      this.logger.warn(
        `Payment ${attempt.id} has an unknown provider outcome; it will be reconciled`,
      );
      return processingPaymentResponse();
    }
  }

  /**
   * Applies a known provider outcome. Public because the webhook delivers
   * outcomes the app never asked for.
   */
  async applyProviderResult(
    attempt: PaymentAttempt,
    result: ChargeResult,
  ): Promise<Record<string, unknown>> {
    if (result.status === 'pending') return processingPaymentResponse();

    // Money arrived for an attempt already given up on, so the slot is gone.
    if (
      result.status === 'succeeded' &&
      (attempt.isFailed() || attempt.isAwaitingRefund())
    )
      return this.refundService.refundUnavailableBooking(attempt, result);

    if (result.status === 'declined') {
      await this.settlementService.recordDecline(attempt, result);
      return failedPaymentResponse();
    }

    const settled = await this.settlementService.finalizeBooking(
      attempt,
      result,
    );
    return settled.response ?? this.confirmationForAttempt(settled.attempt);
  }

  /**
   * Claims the hold and records a PROCESSING attempt with its session, under an
   * advisory lock on the idempotency key so concurrent retries serialize.
   */
  private async openAttempt(
    userId: string,
    paymentMethodId: string,
    holdId: string,
    idempotencyKey: string,
    card: PaymentMethod | undefined,
    now: Date,
  ): Promise<PaymentAttempt> {
    return this.unitOfWork.execute(async (repos) => {
      await repos.lockIdempotencyKey(userId, idempotencyKey);

      const existing = await repos.attempts.findByIdempotencyKeyForUpdate(
        userId,
        idempotencyKey,
      );
      if (existing) {
        this.assertSameRequest(existing, paymentMethodId, holdId);
        return existing;
      }
      if (!card) throw new ConflictException('Payment attempt changed; retry');

      // Claiming the hold and recording the attempt are one unit: a charge
      // must never exist against a hold that was not claimed for it.
      const hold = await this.appointmentBookingService.claimHold(
        repos.appointment,
        userId,
        holdId,
        now,
      );

      const attempt = await repos.attempts.create({
        userId,
        holdId,
        paymentMethodId,
        providerRef: card.providerRef,
        idempotencyKey,
        amount: hold.frozenAmount,
        currency: 'EGP',
      });

      await repos.sessions.insert({
        userId,
        paymentAttemptId: attempt.id,
        holdId,
        doctorId: hold.doctorId,
        clinicId: hold.clinicId,
        scheduledAt: hold.scheduledAt,
        amount: hold.frozenAmount,
        currency: 'EGP',
      });

      return attempt;
    });
  }

  private findAttempt(
    userId: string,
    idempotencyKey: string,
  ): Promise<PaymentAttempt | null> {
    return this.attemptRepository.findByIdempotencyKey(userId, idempotencyKey);
  }

  /**
   * An idempotency key identifies one request, not just one caller. Reusing it
   * for a different card or hold is a client bug, and silently serving the
   * first result would hide it.
   */
  private assertSameRequest(
    attempt: PaymentAttempt,
    paymentMethodId: string,
    holdId: string,
  ): void {
    if (
      attempt.paymentMethodId !== paymentMethodId ||
      attempt.holdId !== holdId
    )
      throw new ConflictException(
        'Idempotency-Key was already used for a different payment request',
      );
  }

  /**
   * Falls back to "processing" when the appointment cannot be read: the attempt
   * says SUCCEEDED, so claiming failure would be wrong, and the client is told
   * to poll.
   */
  private async confirmationForAttempt(
    attempt: PaymentAttempt,
  ): Promise<Record<string, unknown>> {
    if (!attempt.appointmentId) return processingPaymentResponse();

    const appointment = await this.appointmentRepository.findReceipt(
      attempt.appointmentId,
      attempt.userId,
    );

    return appointment
      ? confirmedPaymentResponse(appointment)
      : processingPaymentResponse();
  }
}
