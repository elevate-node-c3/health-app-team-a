import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AppointmentBookingService } from 'src/appointment/appointment-booking.service';
import { AppointmentOrmEntity } from 'src/appointment/infrastructure/entities/typeorm/appointment.entity';
import { OutboxEventOrmEntity } from 'src/infrastructure/database/entities/outbox-event.entity';
import { DataSource, In } from 'typeorm';

import { PaymentMethod } from './domain/entities/payment-method.model';
import { PAYMENT_METHOD_REPOSITORY } from './domain/repositories/payment-method.repository';
import { PAYMENT_PROVIDER } from './domain/services/payment-provider.port';
import { AddPaymentMethodDto } from './dto/add-payment-method.dto';
import { EditPaymentMethodDto } from './dto/edit-payment-method.dto';
import {
  PaymentAttemptOrmEntity,
  PaymentAttemptStatus,
} from './infrastructure/entities/typeorm/payment-attempt.entity';
import {
  PAYMENT_METHOD_ADDED_EVENT,
  PAYMENT_METHOD_REMOVED_EVENT,
} from './payment-method.events';
import { ExpiredCardException } from './payment-method.exceptions';
import {
  APPOINTMENT_BOOKED_EVENT,
  PAYMENT_FAILED_EVENT,
  PAYMENT_SUCCEEDED_EVENT,
} from './payment.events';

import type {
  EditPaymentMethodInput,
  PaymentMethodRepository,
} from './domain/repositories/payment-method.repository';
import type {
  ChargeResult,
  PaymentProvider,
} from './domain/services/payment-provider.port';

const PAYMENT_RECONCILIATION_INTERVAL_MS = 30_000;
const CONFIRMATION_FAILED_MESSAGE =
  "Payment Failed, We couldn't process your payment. Please check your card details";

export interface PaymentMethodResponse {
  id: string;
  brand: string;
  last4: string;
  holderName: string;
  expiryMonth: number;
  expiryYear: number;
  isExpired: boolean;
  isPayable: boolean;
  createdAt: Date;
}

@Injectable()
export class PaymentMethodService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PaymentMethodService.name);
  private reconciliationTimer?: NodeJS.Timeout;

  constructor(
    @Inject(PAYMENT_METHOD_REPOSITORY)
    private readonly paymentMethodRepository: PaymentMethodRepository,
    @Inject(PAYMENT_PROVIDER)
    private readonly paymentProvider: PaymentProvider,
    private readonly eventEmitter: EventEmitter2,
    private readonly dataSource: DataSource,
    private readonly appointmentBookingService: AppointmentBookingService,
  ) {}

  onModuleInit(): void {
    this.reconciliationTimer = setInterval(() => {
      void this.reconcilePayments().catch((error: unknown) => {
        this.logger.error('Payment reconciliation failed', error);
      });
    }, PAYMENT_RECONCILIATION_INTERVAL_MS);
    this.reconciliationTimer.unref();
  }

  onModuleDestroy(): void {
    if (this.reconciliationTimer) clearInterval(this.reconciliationTimer);
  }

  async confirmPayment(
    userId: string,
    paymentMethodId: string,
    holdId: string,
    idempotencyKey: string,
    now: Date = new Date(),
  ): Promise<Record<string, unknown>> {
    if (idempotencyKey.length < 8 || idempotencyKey.length > 128)
      throw new BadRequestException(
        'A valid Idempotency-Key header is required',
      );

    let attempt = await this.dataSource
      .getRepository(PaymentAttemptOrmEntity)
      .findOneBy({ userId, idempotencyKey });
    let card: PaymentMethod | undefined;
    if (!attempt) card = await this.getForCharge(userId, paymentMethodId, now);

    try {
      attempt = await this.dataSource.transaction(async (manager) => {
        await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
          `payment-idempotency:${userId}:${idempotencyKey}`,
        ]);
        const attempts = manager.getRepository(PaymentAttemptOrmEntity);
        const existing = await attempts.findOne({
          where: { userId, idempotencyKey },
          lock: { mode: 'pessimistic_write' },
        });
        if (existing) {
          this.assertSameRequest(existing, paymentMethodId, holdId);
          return existing;
        }
        if (!card)
          throw new ConflictException('Payment attempt changed; retry');

        const hold = await this.appointmentBookingService.claimHold(
          manager,
          userId,
          holdId,
          now,
        );
        const created = attempts.create({
          userId,
          holdId,
          paymentMethodId,
          providerRef: card.providerRef,
          idempotencyKey,
          amount: hold.frozenAmount,
          currency: 'EGP',
          status: PaymentAttemptStatus.PROCESSING,
          providerPaymentId: null,
          appointmentId: null,
        });
        return attempts.save(created);
      });
    } catch (error) {
      if ((error as { code?: string }).code !== '23505') throw error;
      const concurrentAttempt = await this.dataSource
        .getRepository(PaymentAttemptOrmEntity)
        .findOneBy({ userId, idempotencyKey });
      if (!concurrentAttempt) throw error;
      this.assertSameRequest(concurrentAttempt, paymentMethodId, holdId);
      attempt = concurrentAttempt;
    }

    if (attempt.status === PaymentAttemptStatus.SUCCEEDED)
      return this.confirmationForAttempt(attempt);
    if (attempt.status === PaymentAttemptStatus.FAILED)
      return this.failedPaymentResponse();

    return this.resolveAttempt(attempt);
  }

  async getPaymentStatus(
    userId: string,
    idempotencyKey: string,
  ): Promise<Record<string, unknown>> {
    const attempt = await this.dataSource
      .getRepository(PaymentAttemptOrmEntity)
      .findOneBy({ userId, idempotencyKey });
    if (!attempt) throw new NotFoundException('Payment attempt not found');
    if (attempt.status === PaymentAttemptStatus.SUCCEEDED)
      return this.confirmationForAttempt(attempt);
    if (attempt.status === PaymentAttemptStatus.FAILED)
      return this.failedPaymentResponse();
    return this.processingPaymentResponse();
  }

  async handleProviderWebhook(
    payload: unknown,
    signature: string | undefined,
  ): Promise<{ accepted: true }> {
    if (!signature)
      throw new UnauthorizedException('Missing provider signature');
    const verified = await this.paymentProvider.verifyWebhook(
      payload,
      signature,
    );
    if (!verified)
      throw new UnauthorizedException('Invalid provider signature');

    const attempt = await this.dataSource
      .getRepository(PaymentAttemptOrmEntity)
      .findOneBy({ id: verified.idempotencyKey });
    if (!attempt) throw new NotFoundException('Payment attempt not found');
    const currentResult =
      (await this.paymentProvider.getCharge(attempt.id)) ?? verified;
    await this.applyProviderResult(attempt, currentResult);
    return { accepted: true };
  }

  private async resolveAttempt(
    attempt: PaymentAttemptOrmEntity,
  ): Promise<Record<string, unknown>> {
    if (attempt.status === PaymentAttemptStatus.REFUND_PENDING)
      return this.retryRefund(attempt);

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
      this.logger.warn(
        `Payment ${attempt.id} has an unknown provider outcome; it will be reconciled`,
      );
      return this.processingPaymentResponse();
    }
  }

  private async applyProviderResult(
    attempt: PaymentAttemptOrmEntity,
    result: ChargeResult,
  ): Promise<Record<string, unknown>> {
    if (result.status === 'pending') return this.processingPaymentResponse();
    if (
      result.status === 'succeeded' &&
      (attempt.status === PaymentAttemptStatus.FAILED ||
        attempt.status === PaymentAttemptStatus.REFUND_PENDING)
    )
      return this.refundUnavailableBooking(attempt, result);
    if (result.status === 'declined') {
      await this.dataSource.transaction(async (manager) => {
        const locked = await manager
          .getRepository(PaymentAttemptOrmEntity)
          .findOne({
            where: { id: attempt.id },
            lock: { mode: 'pessimistic_write' },
          });
        if (!locked || locked.status !== PaymentAttemptStatus.PROCESSING)
          return;

        locked.status = PaymentAttemptStatus.FAILED;
        locked.providerPaymentId = result.providerPaymentId;
        await this.appointmentBookingService.releaseHold(
          manager,
          locked.holdId,
        );
        await manager.save(locked);
        await this.insertOutboxEvent(manager, PAYMENT_FAILED_EVENT, {
          userId: locked.userId,
          paymentAttemptId: locked.id,
          amount: locked.amount,
          currency: locked.currency,
        });
      });
      return this.failedPaymentResponse();
    }

    try {
      const finalized = await this.dataSource.transaction(async (manager) => {
        const attempts = manager.getRepository(PaymentAttemptOrmEntity);
        const locked = await attempts.findOne({
          where: { id: attempt.id },
          lock: { mode: 'pessimistic_write' },
        });
        if (!locked) throw new NotFoundException('Payment attempt not found');
        if (locked.status === PaymentAttemptStatus.SUCCEEDED) return locked;
        if (locked.status === PaymentAttemptStatus.FAILED) return locked;

        const booked = await this.appointmentBookingService.bookClaimedHold(
          manager,
          locked.holdId,
        );
        locked.status = PaymentAttemptStatus.SUCCEEDED;
        locked.providerPaymentId = result.providerPaymentId;
        locked.appointmentId = booked.appointment.id;
        await attempts.save(locked);

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
        await this.insertOutboxEvent(
          manager,
          PAYMENT_SUCCEEDED_EVENT,
          eventPayload,
        );
        await this.insertOutboxEvent(
          manager,
          APPOINTMENT_BOOKED_EVENT,
          eventPayload,
        );
        return locked;
      });

      if (finalized.status === PaymentAttemptStatus.SUCCEEDED)
        return this.confirmationForAttempt(finalized);
      return this.failedPaymentResponse();
    } catch (error) {
      if (error instanceof ConflictException)
        return this.refundUnavailableBooking(attempt, result);
      this.logger.error(
        `Payment ${attempt.id} succeeded at the provider but booking finalization failed; reconciliation will retry`,
        error,
      );
      return this.processingPaymentResponse();
    }
  }

  private async reconcilePayments(): Promise<void> {
    const pending = await this.dataSource
      .getRepository(PaymentAttemptOrmEntity)
      .find({
        where: {
          status: In([
            PaymentAttemptStatus.PROCESSING,
            PaymentAttemptStatus.REFUND_PENDING,
          ]),
        },
        order: { updatedAt: 'ASC' },
        take: 25,
      });
    for (const attempt of pending) await this.resolveAttempt(attempt);
  }

  private async refundUnavailableBooking(
    attempt: PaymentAttemptOrmEntity,
    result: ChargeResult,
  ): Promise<Record<string, unknown>> {
    try {
      const refunded = await this.paymentProvider.refund(
        result.providerPaymentId,
        `refund:${attempt.id}`,
      );
      if (refunded) {
        await this.markRefunded(attempt.id, result.providerPaymentId);
        return this.failedPaymentResponse();
      }
    } catch {
      this.logger.warn(`Refund for payment ${attempt.id} is not confirmed`);
    }

    await this.dataSource.getRepository(PaymentAttemptOrmEntity).update(
      {
        id: attempt.id,
        status: In([
          PaymentAttemptStatus.PROCESSING,
          PaymentAttemptStatus.FAILED,
        ]),
      },
      {
        status: PaymentAttemptStatus.REFUND_PENDING,
        providerPaymentId: result.providerPaymentId,
      },
    );
    return this.processingPaymentResponse();
  }

  private async retryRefund(
    attempt: PaymentAttemptOrmEntity,
  ): Promise<Record<string, unknown>> {
    if (!attempt.providerPaymentId) return this.processingPaymentResponse();
    try {
      const refunded = await this.paymentProvider.refund(
        attempt.providerPaymentId,
        `refund:${attempt.id}`,
      );
      if (refunded) {
        await this.markRefunded(attempt.id, attempt.providerPaymentId);
        return this.failedPaymentResponse();
      }
    } catch {
      this.logger.warn(`Refund for payment ${attempt.id} is not confirmed`);
    }
    return this.processingPaymentResponse();
  }

  private async markRefunded(
    attemptId: string,
    providerPaymentId: string,
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const attempts = manager.getRepository(PaymentAttemptOrmEntity);
      const attempt = await attempts.findOne({
        where: { id: attemptId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!attempt || attempt.status === PaymentAttemptStatus.SUCCEEDED) return;

      attempt.status = PaymentAttemptStatus.FAILED;
      attempt.providerPaymentId = providerPaymentId;
      await this.appointmentBookingService.releaseHold(manager, attempt.holdId);
      await attempts.save(attempt);
      await this.insertOutboxEvent(manager, PAYMENT_FAILED_EVENT, {
        userId: attempt.userId,
        paymentAttemptId: attempt.id,
        amount: attempt.amount,
        currency: attempt.currency,
        reason: 'BOOKING_UNAVAILABLE_REFUNDED',
      });
    });
  }

  private assertSameRequest(
    attempt: PaymentAttemptOrmEntity,
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

  private async confirmationForAttempt(
    attempt: PaymentAttemptOrmEntity,
  ): Promise<Record<string, unknown>> {
    if (!attempt.appointmentId) return this.processingPaymentResponse();
    const appointment = await this.dataSource
      .getRepository(AppointmentOrmEntity)
      .findOne({
        where: { id: attempt.appointmentId, userId: attempt.userId },
        relations: { doctor: true, clinic: true },
      });
    if (!appointment) return this.processingPaymentResponse();

    const formattedTime = new Intl.DateTimeFormat('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(appointment.scheduledAt);
    return {
      status: 'confirmed',
      paymentStatus: 'succeeded',
      appointmentId: appointment.id,
      scheduledAt: appointment.scheduledAt,
      doctorName: appointment.doctor.name,
      clinicName: appointment.clinic?.name ?? null,
      arriveAt: new Date(appointment.scheduledAt.getTime() - 15 * 60_000),
      message: `Your appointment has been booked successfully. On ${formattedTime} with Dr. ${appointment.doctor.name}. We will remind you. Please arrive 15 minutes before the appointment.`,
    };
  }

  private failedPaymentResponse(): Record<string, unknown> {
    return {
      status: 'failed',
      paymentStatus: 'failed',
      message: CONFIRMATION_FAILED_MESSAGE,
      action: 'CHECK_CARD_DETAILS',
    };
  }

  private processingPaymentResponse(): Record<string, unknown> {
    return {
      status: 'processing',
      paymentStatus: 'processing',
      message:
        'Payment is still being confirmed. Your appointment time is being held. Do not pay again; check this payment using the same request key.',
      retryWithSameKey: true,
    };
  }

  private async insertOutboxEvent(
    manager: import('typeorm').EntityManager,
    eventName: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const event = manager
      .getRepository(OutboxEventOrmEntity)
      .create({ eventName, payload, publishedAt: null });
    await manager.getRepository(OutboxEventOrmEntity).save(event);
  }

  async list(
    userId: string,
    now: Date = new Date(),
  ): Promise<PaymentMethodResponse[]> {
    const cards = await this.paymentMethodRepository.findAllForUser(userId);
    return cards.map((card) => this.toResponse(card, now));
  }

  async add(
    userId: string,
    dto: AddPaymentMethodDto,
    now: Date = new Date(),
  ): Promise<PaymentMethodResponse> {
    const { month, year } = this.parseExpiry(dto.expiry);

    const tokenized = await this.paymentProvider.tokenize({
      holderName: dto.holderName,
      cardNumber: dto.cardNumber,
      ccv: dto.ccv,
      expiryMonth: month,
      expiryYear: year,
    });

    if (dto.saveCard) {
      const duplicate = await this.paymentMethodRepository.findDuplicate(
        userId,
        {
          brand: tokenized.brand,
          last4: tokenized.last4,
          expiryMonth: month,
          expiryYear: year,
        },
      );
      if (duplicate) throw new ConflictException('This card is already saved');
    }

    if (!dto.saveCard) {
      const preview = new PaymentMethod(
        '',
        userId,
        tokenized.providerRef,
        tokenized.brand,
        tokenized.last4,
        dto.holderName,
        month,
        year,
        now,
        now,
      );
      return this.toResponse(preview, now);
    }

    const saved = await this.paymentMethodRepository.add(userId, {
      providerRef: tokenized.providerRef,
      brand: tokenized.brand,
      last4: tokenized.last4,
      holderName: dto.holderName,
      expiryMonth: month,
      expiryYear: year,
    });

    this.eventEmitter.emit(PAYMENT_METHOD_ADDED_EVENT, {
      userId,
      paymentMethodId: saved.id,
      brand: saved.brand,
      last4: saved.last4,
      at: now,
    });

    return this.toResponse(saved, now);
  }

  async edit(
    userId: string,
    id: string,
    dto: EditPaymentMethodDto,
    now: Date = new Date(),
  ): Promise<PaymentMethodResponse> {
    const input: EditPaymentMethodInput = {};
    if (dto.holderName !== undefined) input.holderName = dto.holderName;
    if (dto.expiry !== undefined) {
      const { month, year } = this.parseExpiry(dto.expiry);
      input.expiryMonth = month;
      input.expiryYear = year;
    }

    const updated = await this.paymentMethodRepository.edit(id, userId, input);
    if (!updated) throw new NotFoundException('Payment method not found');
    return this.toResponse(updated, now);
  }

  async remove(
    userId: string,
    id: string,
    now: Date = new Date(),
  ): Promise<{ deleted: true }> {
    const removed = await this.paymentMethodRepository.remove(id, userId);
    if (!removed) throw new NotFoundException('Payment method not found');

    this.eventEmitter.emit(PAYMENT_METHOD_REMOVED_EVENT, {
      userId,
      paymentMethodId: id,
      at: now,
    });
    return { deleted: true };
  }

  async getForCharge(
    userId: string,
    id: string,
    now: Date = new Date(),
  ): Promise<PaymentMethod> {
    const card = await this.paymentMethodRepository.findByIdForUser(id, userId);
    if (!card) throw new NotFoundException('Payment method not found');
    if (card.isExpired(now)) throw new ExpiredCardException();
    return card;
  }

  private parseExpiry(expiry: string): { month: number; year: number } {
    const [month, year] = expiry.split('/').map(Number);
    return { month, year: 2000 + year };
  }

  private toResponse(
    paymentMethod: PaymentMethod,
    now: Date,
  ): PaymentMethodResponse {
    const isExpired = paymentMethod.isExpired(now);
    return {
      id: paymentMethod.id,
      brand: paymentMethod.brand,
      last4: paymentMethod.last4,
      holderName: paymentMethod.holderName,
      expiryMonth: paymentMethod.expiryMonth,
      expiryYear: paymentMethod.expiryYear,
      isExpired,
      isPayable: !isExpired,
      createdAt: paymentMethod.createdAt,
    };
  }
}
