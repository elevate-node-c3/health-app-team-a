import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { User } from 'src/auth/domain/entities/user.model';
import {
  SLOT_HOLD_EXPIRED_EVENT,
  SLOT_HOLD_HELD_EVENT,
} from 'src/infrastructure/messaging/event-names';
import { EVENT_PUBLISHER } from 'src/infrastructure/messaging/event-publisher.port';

import { SlotHold } from './domain/entities/slot-hold.model';
import { SlotHoldStatus } from './domain/enums/slot-hold-status.enum';
import { SLOT_HOLD_REPOSITORY } from './domain/repositories/slot-hold.repository';
import { CreateSlotHoldDto } from './dto/create-slot-hold.dto';

import type { SlotHoldRepository } from './domain/repositories/slot-hold.repository';
import type {
  HoldExpiredEvent,
  HoldExpiredReason,
  SlotHeldEvent,
} from './slot-hold.events';
import type { EventPublisher } from 'src/infrastructure/messaging/event-publisher.port';

const REAP_BATCH_SIZE = 100;

export interface SlotHoldResponse {
  id: string;
  doctorId: string;
  clinicId: string;
  scheduledAt: Date;
  feeAmount: number;
  status: SlotHoldStatus;
  extended: boolean;
  expiresAt: Date;
  expiresInMs: number;
}

export interface HoldResult {
  created: boolean;
  hold: SlotHoldResponse;
}

@Injectable()
export class SlotHoldService {
  constructor(
    @Inject(SLOT_HOLD_REPOSITORY)
    private readonly slotHoldRepository: SlotHoldRepository,
    @Inject(EVENT_PUBLISHER)
    private readonly events: EventPublisher,
  ) {}

  /**
   * Verification is not checked here: `@Verified()` on the controller refuses
   * an unverified caller before the request reaches this method, and the same
   * decorator governs every other booking route. A second check in this one
   * service is how the two booking paths came to disagree in the first place.
   */
  async hold(
    user: User,
    dto: CreateSlotHoldDto,
    now: Date = new Date(),
  ): Promise<HoldResult> {
    const scheduledAt = new Date(dto.scheduledAt);
    const fee =
      scheduledAt > now
        ? await this.slotHoldRepository.findFeeForSlot(
            dto.doctorId,
            dto.clinicId,
            scheduledAt,
          )
        : null;
    if (fee === null)
      throw new BadRequestException('This time is not available for booking');

    const result = await this.slotHoldRepository.acquire({
      userId: user.id,
      doctorId: dto.doctorId,
      clinicId: dto.clinicId,
      scheduledAt,
      feeAmount: fee,
    });

    this.emitExpired(result.expiredBySweep, 'expired', now);

    switch (result.outcome) {
      case 'held':
        this.emitHeld(result.hold, now);
        return { created: true, hold: this.toResponse(result.hold, now) };
      case 'held_by_caller':
        return { created: false, hold: this.toResponse(result.hold, now) };
      case 'slot_taken':
        throw new ConflictException(
          'That time was just taken. Please pick another time',
        );
      case 'already_booked':
        throw new ConflictException(
          result.mine
            ? 'You have already booked this appointment'
            : 'That time is already booked. Please pick another time',
        );
    }
  }

  async get(
    userId: string,
    id: string,
    now: Date = new Date(),
  ): Promise<SlotHoldResponse> {
    const hold = await this.slotHoldRepository.findByIdForUser(id, userId);
    if (!hold) throw new NotFoundException('Hold not found');
    return this.toResponse(hold, now);
  }

  async extend(
    userId: string,
    id: string,
    now: Date = new Date(),
  ): Promise<SlotHoldResponse> {
    const hold = await this.slotHoldRepository.extend(id, userId);
    if (!hold) throw new ConflictException('This hold cannot be extended');
    return this.toResponse(hold, now);
  }

  async release(
    userId: string,
    id: string,
    now: Date = new Date(),
  ): Promise<{ released: true }> {
    const hold = await this.slotHoldRepository.release(id, userId);
    if (!hold) throw new NotFoundException('Active hold not found');

    this.emitExpired([hold], 'released', now);
    return { released: true };
  }

  async reapExpired(now: Date = new Date()): Promise<number> {
    const expired = await this.slotHoldRepository.sweepExpired(REAP_BATCH_SIZE);
    this.emitExpired(expired, 'expired', now);
    return expired.length;
  }

  private emitHeld(hold: SlotHold, now: Date): void {
    this.events.emit(SLOT_HOLD_HELD_EVENT, {
      holdId: hold.id,
      userId: hold.userId,
      doctorId: hold.doctorId,
      clinicId: hold.clinicId,
      scheduledAt: hold.scheduledAt.toISOString(),
      feeAmount: hold.feeAmount,
      expiresAt: hold.expiresAt.toISOString(),
      at: now.toISOString(),
    } satisfies SlotHeldEvent);
  }

  private emitExpired(
    holds: SlotHold[],
    reason: HoldExpiredReason,
    now: Date,
  ): void {
    for (const hold of holds) {
      this.events.emit(SLOT_HOLD_EXPIRED_EVENT, {
        holdId: hold.id,
        userId: hold.userId,
        doctorId: hold.doctorId,
        clinicId: hold.clinicId,
        scheduledAt: hold.scheduledAt.toISOString(),
        reason,
        at: now.toISOString(),
      } satisfies HoldExpiredEvent);
    }
  }

  private toResponse(hold: SlotHold, now: Date): SlotHoldResponse {
    return {
      id: hold.id,
      doctorId: hold.doctorId,
      clinicId: hold.clinicId,
      scheduledAt: hold.scheduledAt,
      feeAmount: hold.feeAmount,
      status: hold.status,
      extended: hold.extended,
      expiresAt: hold.expiresAt,
      expiresInMs: hold.remainingMs(now),
    };
  }
}
