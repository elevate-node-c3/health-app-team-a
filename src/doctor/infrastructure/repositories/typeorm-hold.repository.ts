import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { BookingHoldStatus } from 'src/appointment/domain/enums/booking-hold-status.enum';
import { BookingHoldOrmEntity } from 'src/appointment/infrastructure/entities/typeorm/booking-hold.entity';
import { SlotHoldStatus } from 'src/slot-hold/domain/enums/slot-hold-status.enum';
import { SlotHoldOrmEntity } from 'src/slot-hold/infrastructure/entities/typeorm/slot-hold.entity';
import { And, LessThan, MoreThan, MoreThanOrEqual, Repository } from 'typeorm';

import type {
  HeldInstant,
  HoldRepository,
} from 'src/doctor/domain/repositories/hold.repository';

/**
 * Reads the two hold tables that can make an instant unbookable. Each query
 * mirrors its own module's liveness rule exactly, so what the snapshot calls
 * held is precisely what the hold endpoint would refuse.
 */
@Injectable()
export class TypeOrmHoldRepository implements HoldRepository {
  constructor(
    @InjectRepository(BookingHoldOrmEntity)
    private readonly bookingHoldRepo: Repository<BookingHoldOrmEntity>,
    @InjectRepository(SlotHoldOrmEntity)
    private readonly slotHoldRepo: Repository<SlotHoldOrmEntity>,
  ) {}

  async findHeldInstants(
    doctorId: string,
    from: Date,
    to: Date,
    now: Date,
  ): Promise<HeldInstant[]> {
    const [bookingHolds, slotHolds] = await Promise.all([
      this.findBookingHolds(doctorId, from, to, now),
      this.findSlotHolds(doctorId, from, to, now),
    ]);

    // Both tables may hold the same instant; overlapping ranges collapse
    // harmlessly when the slot grid is marked, so they are not deduplicated.
    return [...bookingHolds, ...slotHolds];
  }

  /**
   * A booking hold blocks while payment is pending — which has no expiry, the
   * money is in flight — or while it is still held and unexpired. The two
   * where-objects are OR'd, matching AppointmentBookingService.assertSlotAvailable.
   */
  private async findBookingHolds(
    doctorId: string,
    from: Date,
    to: Date,
    now: Date,
  ): Promise<HeldInstant[]> {
    const rows = await this.bookingHoldRepo.find({
      select: { scheduledAt: true },
      where: [
        {
          doctorId,
          status: BookingHoldStatus.PAYMENT_PENDING,
          scheduledAt: within(from, to),
        },
        {
          doctorId,
          status: BookingHoldStatus.HELD,
          expiresAt: MoreThan(now),
          scheduledAt: within(from, to),
        },
      ],
    });

    return toHeldInstants(rows);
  }

  /** A slot hold blocks while ACTIVE and unexpired — SlotHold.isActive(). */
  private async findSlotHolds(
    doctorId: string,
    from: Date,
    to: Date,
    now: Date,
  ): Promise<HeldInstant[]> {
    const rows = await this.slotHoldRepo.find({
      select: { scheduledAt: true },
      where: {
        doctorId,
        status: SlotHoldStatus.ACTIVE,
        expiresAt: MoreThan(now),
        scheduledAt: within(from, to),
      },
    });

    return toHeldInstants(rows);
  }
}

/** The half-open window `[from, to)` the availability month covers. */
function within(from: Date, to: Date) {
  return And(MoreThanOrEqual(from), LessThan(to));
}

/** Neither table records a length, so every hold defers to the day's grid. */
function toHeldInstants(rows: { scheduledAt: Date }[]): HeldInstant[] {
  return rows.map((row) => ({
    scheduledAt: row.scheduledAt,
    durationMinutes: null,
  }));
}
