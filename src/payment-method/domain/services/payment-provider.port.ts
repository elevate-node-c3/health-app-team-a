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

export interface ChargeRequest {
  providerRef: string;
  amount: string;
  currency: string;
  idempotencyKey: string;
}

export type ChargeStatus = 'succeeded' | 'declined' | 'pending';

export interface ChargeResult {
  providerPaymentId: string;
  status: ChargeStatus;
}

export interface VerifiedPaymentWebhook extends ChargeResult {
  idempotencyKey: string;
}

export interface PaymentProvider {
  tokenize(card: RawCardDetails): Promise<TokenizedCard>;
  charge(request: ChargeRequest): Promise<ChargeResult>;
  getCharge(idempotencyKey: string): Promise<ChargeResult | null>;
  refund(providerPaymentId: string, idempotencyKey: string): Promise<boolean>;
  verifyWebhook(
    payload: unknown,
    signature: string,
  ): Promise<VerifiedPaymentWebhook | null>;
}

export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');
