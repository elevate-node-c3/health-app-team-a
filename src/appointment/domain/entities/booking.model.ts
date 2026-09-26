import { BookingStatus } from '../enums/booking-status.enum';

export class Booking {
  constructor(
    public readonly id: string,
    public readonly userId: string,
    public readonly slotId: string,
    public readonly expiresAt: string,
    public status: BookingStatus,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
  ) {}
}
