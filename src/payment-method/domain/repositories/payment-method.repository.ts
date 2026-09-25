import { PaymentMethod } from '../entities/payment-method.model';
import { CardBrand } from '../enums/card.enum';

export interface AddPaymentMethodInput {
  providerRef: string;
  brand: CardBrand;
  last4: string;
  holderName: string;
  expiryMonth: number;
  expiryYear: number;
}

export interface EditPaymentMethodInput {
  holderName?: string;
  expiryMonth?: number;
  expiryYear?: number;
}

export interface DuplicateCardLookup {
  brand: CardBrand;
  last4: string;
  expiryMonth: number;
  expiryYear: number;
}

export interface PaymentMethodRepository {
  findAllForUser(userId: string): Promise<PaymentMethod[]>;

  findByIdForUser(id: string, userId: string): Promise<PaymentMethod | null>;

  findDuplicate(
    userId: string,
    lookup: DuplicateCardLookup,
  ): Promise<PaymentMethod | null>;

  add(userId: string, input: AddPaymentMethodInput): Promise<PaymentMethod>;

  edit(
    id: string,
    userId: string,
    input: EditPaymentMethodInput,
  ): Promise<PaymentMethod | null>;

  remove(id: string, userId: string): Promise<boolean>;
}

export const PAYMENT_METHOD_REPOSITORY = Symbol('PAYMENT_METHOD_REPOSITORY');
