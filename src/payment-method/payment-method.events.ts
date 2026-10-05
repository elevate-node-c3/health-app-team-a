import { CardBrand } from './domain/entities/card-brand.enum';

export interface PaymentMethodAddedEvent {
  userId: string;
  paymentMethodId: string;
  brand: CardBrand;
  last4: string;
  /** ISO instant — every event payload carries dates as strings on the wire. */
  at: string;
}

export interface PaymentMethodRemovedEvent {
  userId: string;
  paymentMethodId: string;
  at: string;
}
