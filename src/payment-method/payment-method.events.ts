import { CardBrand } from './domain/entities/card-brand.enum';

export const PAYMENT_METHOD_ADDED_EVENT = 'payment-method.added';
export const PAYMENT_METHOD_REMOVED_EVENT = 'payment-method.removed';

export interface PaymentMethodAddedEvent {
  userId: string;
  paymentMethodId: string;
  brand: CardBrand;
  last4: string;
  at: Date;
}

export interface PaymentMethodRemovedEvent {
  userId: string;
  paymentMethodId: string;
  at: Date;
}
