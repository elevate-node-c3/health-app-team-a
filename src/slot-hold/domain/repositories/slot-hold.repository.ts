import { SlotHold } from 'src/slot-hold/domain/entities/slot-hold.model';

export interface AcquireSlotHoldInput {
  userId: string;
  doctorId: string;
  clinicId: string;
  scheduledAt: Date;
  feeAmount: number;
}

export type AcquireOutcome =
  | { outcome: 'held'; hold: SlotHold }
  | { outcome: 'held_by_caller'; hold: SlotHold }
  | { outcome: 'slot_taken' }
  | { outcome: 'already_booked'; mine: boolean };

export type AcquireResult = AcquireOutcome & { expiredBySweep: SlotHold[] };

export interface SlotHoldRepository {
  findFeeForSlot(
    doctorId: string,
    clinicId: string,
    scheduledAt: Date,
  ): Promise<number | null>;

  acquire(input: AcquireSlotHoldInput): Promise<AcquireResult>;

  findByIdForUser(id: string, userId: string): Promise<SlotHold | null>;

  extend(id: string, userId: string): Promise<SlotHold | null>;

  release(id: string, userId: string): Promise<SlotHold | null>;

  sweepExpired(limit: number): Promise<SlotHold[]>;
}

export const SLOT_HOLD_REPOSITORY = Symbol('SLOT_HOLD_REPOSITORY');
