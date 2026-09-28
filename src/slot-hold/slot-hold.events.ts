export const SLOT_HELD_EVENT = 'slot.held';
export const HOLD_EXPIRED_EVENT = 'slot-hold.expired';

export type HoldExpiredReason = 'expired' | 'released' | 'schedule_removed';

export interface SlotHeldEvent {
  holdId: string;
  userId: string;
  doctorId: string;
  clinicId: string;
  scheduledAt: Date;
  feeAmount: number;
  expiresAt: Date;
  at: Date;
}

export interface HoldExpiredEvent {
  holdId: string;
  userId: string;
  doctorId: string;
  clinicId: string;
  scheduledAt: Date;
  reason: HoldExpiredReason;
  at: Date;
}
