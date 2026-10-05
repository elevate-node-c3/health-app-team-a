export type HoldExpiredReason = 'expired' | 'released' | 'schedule_removed';

/** ISO instants — every event payload carries dates as strings on the wire. */
export interface SlotHeldEvent {
  holdId: string;
  userId: string;
  doctorId: string;
  clinicId: string;
  scheduledAt: string;
  feeAmount: number;
  expiresAt: string;
  at: string;
}

export interface HoldExpiredEvent {
  holdId: string;
  userId: string;
  doctorId: string;
  clinicId: string;
  scheduledAt: string;
  reason: HoldExpiredReason;
  at: string;
}
