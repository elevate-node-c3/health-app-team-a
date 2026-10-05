import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  PAYMENT_METHOD_ADDED_EVENT,
  PAYMENT_METHOD_REMOVED_EVENT,
} from 'src/infrastructure/messaging/event-names';
import { EVENT_PUBLISHER } from 'src/infrastructure/messaging/event-publisher.port';

import { PaymentMethod } from './domain/entities/payment-method.model';
import { PAYMENT_METHOD_REPOSITORY } from './domain/repositories/payment-method.repository';
import { PAYMENT_PROVIDER } from './domain/services/payment-provider.port';
import { AddPaymentMethodDto } from './dto/add-payment-method.dto';
import { EditPaymentMethodDto } from './dto/edit-payment-method.dto';
import { ExpiredCardException } from './payment-method.exceptions';

import type {
  EditPaymentMethodInput,
  PaymentMethodRepository,
} from './domain/repositories/payment-method.repository';
import type { PaymentProvider } from './domain/services/payment-provider.port';
import type {
  PaymentMethodAddedEvent,
  PaymentMethodRemovedEvent,
} from './payment-method.events';
import type { EventPublisher } from 'src/infrastructure/messaging/event-publisher.port';

/** Two-digit card years are this century. */
const EXPIRY_CENTURY = 2000;

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

/**
 * The patient's saved cards: listing, tokenizing, editing and removing them.
 *
 * Deliberately knows nothing about charging — `PaymentChargeService` owns that,
 * and calls `getForCharge` here when it needs a card. Raw card numbers reach
 * `paymentProvider.tokenize` and go no further; only the provider reference and
 * the display fields are ever stored.
 */
@Injectable()
export class PaymentMethodService {
  constructor(
    @Inject(PAYMENT_METHOD_REPOSITORY)
    private readonly paymentMethodRepository: PaymentMethodRepository,
    @Inject(PAYMENT_PROVIDER)
    private readonly paymentProvider: PaymentProvider,
    @Inject(EVENT_PUBLISHER)
    private readonly events: EventPublisher,
  ) {}

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

    // A one-off card is tokenized and shown back, never persisted — the
    // provider reference is all the charge needs, and it lives in the attempt.
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

    this.events.emit(PAYMENT_METHOD_ADDED_EVENT, {
      userId,
      paymentMethodId: saved.id,
      brand: saved.brand,
      last4: saved.last4,
      at: now.toISOString(),
    } satisfies PaymentMethodAddedEvent);

    return this.toResponse(saved, now);
  }

  async edit(
    userId: string,
    id: string,
    dto: EditPaymentMethodDto,
    now: Date = new Date(),
  ): Promise<PaymentMethodResponse> {
    // Only the fields the request actually carried are forwarded, so an absent
    // field keeps its stored value rather than being cleared.
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

    this.events.emit(PAYMENT_METHOD_REMOVED_EVENT, {
      userId,
      paymentMethodId: id,
      at: now.toISOString(),
    } satisfies PaymentMethodRemovedEvent);
    return { deleted: true };
  }

  /**
   * The card a charge should use, refusing an expired one up front rather than
   * letting the provider decline it.
   */
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

  /** 'MM/YY' as the card carries it. */
  private parseExpiry(expiry: string): { month: number; year: number } {
    const [month, year] = expiry.split('/').map(Number);
    return { month, year: EXPIRY_CENTURY + year };
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
