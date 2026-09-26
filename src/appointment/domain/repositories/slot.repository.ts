import { Slot } from '../entities/slot.model';

export interface SlotRepo {
  find(): Promise<Slot[]>;
  findById(id: string): Promise<Slot | null>;
}

export const SLOT_REPO = Symbol('SLOT_REPO');
