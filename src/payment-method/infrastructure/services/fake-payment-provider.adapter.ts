import { randomUUID } from 'crypto';

import { Injectable } from '@nestjs/common';
import { CardBrand } from 'src/payment-method/domain/entities/card-brand.enum';
import {
  PaymentProvider,
  RawCardDetails,
  TokenizedCard,
} from 'src/payment-method/domain/services/payment-provider.port';

@Injectable()
export class FakePaymentProviderAdapter implements PaymentProvider {
  tokenize(card: RawCardDetails): Promise<TokenizedCard> {
    return Promise.resolve({
      providerRef: `fake_${randomUUID()}`,
      brand: this.detectBrand(card.cardNumber),
      last4: card.cardNumber.slice(-4),
    });
  }

  private detectBrand(cardNumber: string): CardBrand {
    return cardNumber.startsWith('5') ? CardBrand.MASTERCARD : CardBrand.VISA;
  }
}
