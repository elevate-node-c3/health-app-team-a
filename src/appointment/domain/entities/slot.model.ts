import { SlotStatus } from '../enums/slot-status.enum';

export class Slot {
  constructor(
    public readonly id: string,
    public readonly doctorClinicScheduleId: string,
    public readonly date: Date,
    public readonly startTime: Date,
    public readonly endTime: Date,
    public status: SlotStatus,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
  ) {}
}
