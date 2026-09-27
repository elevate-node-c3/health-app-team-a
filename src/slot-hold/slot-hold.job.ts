import { Injectable } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';

import { SlotHoldService } from './slot-hold.service';

@Injectable()
export class SlotHoldReaper {
  constructor(private readonly slotHoldService: SlotHoldService) {}

  @Interval(30_000)
  async reapExpired(): Promise<void> {
    await this.slotHoldService.reapExpired();
  }
}
