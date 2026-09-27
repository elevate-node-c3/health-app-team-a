import { CardBrand } from '../entities/card-brand.enum';

export interface RawCardDetails {
  holderName: string;
  cardNumber: string;
  ccv: string;
  expiryMonth: number;
  expiryYear: number;
}

export interface TokenizedCard {
  providerRef: string;
  brand: CardBrand;
  last4: string;
}

export interface PaymentProvider {
  tokenize(card: RawCardDetails): Promise<TokenizedCard>;
}

export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');
