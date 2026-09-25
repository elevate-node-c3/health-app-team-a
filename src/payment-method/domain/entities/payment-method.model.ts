import { CardBrand } from '../enums/card.enum';

export class PaymentMethod {
  constructor(
    public readonly id: string,
    public readonly userId: string,
    public readonly providerRef: string,
    public readonly brand: CardBrand,
    public readonly last4: string,
    public holderName: string,
    public expiryMonth: number,
    public expiryYear: number,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
  ) {}

  isExpired(now: Date): boolean {
    const expiresAt = new Date(this.expiryYear, this.expiryMonth, 1);
    return now >= expiresAt;
  }
}
