import { SlotHoldStatus } from 'src/slot-hold/domain/enums/slot-hold-status.enum';

export const SLOT_DURATION_MINUTES = 30;
export const HOLD_DURATION_MINUTES = 10;
export const HOLD_EXTENSION_MINUTES = 5;

export class SlotHold {
  constructor(
    public readonly id: string,
    public readonly userId: string,
    public readonly doctorId: string,
    public readonly clinicId: string,
    public readonly scheduledAt: Date,
    public readonly feeAmount: number,
    public status: SlotHoldStatus,
    public expiresAt: Date,
    public extended: boolean,
    public appointmentId: string | null,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
  ) {}

  isExpired(now: Date): boolean {
    return now >= this.expiresAt;
  }

  isActive(now: Date): boolean {
    return this.status === SlotHoldStatus.ACTIVE && !this.isExpired(now);
  }

  isHeldBy(userId: string): boolean {
    return this.userId === userId;
  }

  canExtend(now: Date): boolean {
    return this.isActive(now) && !this.extended;
  }

  remainingMs(now: Date): number {
    if (!this.isActive(now)) return 0;
    return this.expiresAt.getTime() - now.getTime();
  }
}
