import { randomUUID } from 'crypto';

import { Injectable } from '@nestjs/common';
import { CardBrand } from 'src/payment-method/domain/entities/card-brand.enum';
import {
  ChargeRequest,
  ChargeResult,
  PaymentProvider,
  RawCardDetails,
  TokenizedCard,
  VerifiedPaymentWebhook,
} from 'src/payment-method/domain/services/payment-provider.port';

@Injectable()
export class FakePaymentProviderAdapter implements PaymentProvider {
  private readonly charges = new Map<string, ChargeResult>();
  private readonly refunds = new Set<string>();

  tokenize(card: RawCardDetails): Promise<TokenizedCard> {
    return Promise.resolve({
      providerRef: `fake_${card.cardNumber.slice(-4)}_${randomUUID()}`,
      brand: this.detectBrand(card.cardNumber),
      last4: card.cardNumber.slice(-4),
    });
  }

  charge(request: ChargeRequest): Promise<ChargeResult> {
    const existing = this.charges.get(request.idempotencyKey);
    if (existing) return Promise.resolve(existing);

    const isDeclinedTestCard = request.providerRef.startsWith('fake_0002_');
    const result: ChargeResult = {
      providerPaymentId: `fake_payment_${randomUUID()}`,
      status: isDeclinedTestCard ? 'declined' : 'succeeded',
    };
    this.charges.set(request.idempotencyKey, result);
    return Promise.resolve(result);
  }

  getCharge(idempotencyKey: string): Promise<ChargeResult | null> {
    return Promise.resolve(this.charges.get(idempotencyKey) ?? null);
  }

  refund(providerPaymentId: string, idempotencyKey: string): Promise<boolean> {
    if (!providerPaymentId.startsWith('fake_payment_'))
      return Promise.resolve(false);
    this.refunds.add(idempotencyKey);
    return Promise.resolve(this.refunds.has(idempotencyKey));
  }

  verifyWebhook(
    payload: unknown,
    signature: string,
  ): Promise<VerifiedPaymentWebhook | null> {
    if (
      signature !== 'fake-provider-signature' ||
      !payload ||
      typeof payload !== 'object'
    )
      return Promise.resolve(null);

    const message = payload as Partial<VerifiedPaymentWebhook>;
    if (
      typeof message.idempotencyKey !== 'string' ||
      typeof message.providerPaymentId !== 'string' ||
      !['succeeded', 'declined', 'pending'].includes(message.status ?? '')
    )
      return Promise.resolve(null);

    const recorded = this.charges.get(message.idempotencyKey);
    if (
      !recorded ||
      recorded.providerPaymentId !== message.providerPaymentId ||
      recorded.status !== message.status
    )
      return Promise.resolve(null);

    return Promise.resolve(message as VerifiedPaymentWebhook);
  }

  private detectBrand(cardNumber: string): CardBrand {
    return cardNumber.startsWith('5') ? CardBrand.MASTERCARD : CardBrand.VISA;
  }
}
