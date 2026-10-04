import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { BookingHoldStatus } from 'src/appointment/domain/enums/booking-hold-status.enum';
import { BookingHoldOrmEntity } from 'src/appointment/infrastructure/entities/typeorm/booking-hold.entity';
import { BookingHoldMapper } from 'src/appointment/infrastructure/mappers/booking-hold.mapper';
import { And, LessThan, MoreThan, Repository } from 'typeorm';

import type { BookingHold } from 'src/appointment/domain/entities/booking-hold.model';
import type {
  BookingHoldRepository,
  CreateBookingHoldInput,
} from 'src/appointment/domain/repositories/booking-hold.repository';

@Injectable()
export class TypeOrmBookingHoldRepository implements BookingHoldRepository {
  constructor(
    @InjectRepository(BookingHoldOrmEntity)
    private readonly holdRepo: Repository<BookingHoldOrmEntity>,
  ) {}

  async create(input: CreateBookingHoldInput): Promise<BookingHold> {
    const saved = await this.holdRepo.save(
      this.holdRepo.create({ ...input, status: BookingHoldStatus.HELD }),
    );
    return BookingHoldMapper.toDomain(saved);
  }

  async findByIdForUpdate(id: string): Promise<BookingHold | null> {
    const row = await this.holdRepo.findOne({
      where: { id },
      lock: { mode: 'pessimistic_write' },
    });
    return row ? BookingHoldMapper.toDomain(row) : null;
  }

  async findByIdForUserForUpdate(
    id: string,
    userId: string,
  ): Promise<BookingHold | null> {
    const row = await this.holdRepo.findOne({
      where: { id, userId },
      lock: { mode: 'pessimistic_write' },
    });
    return row ? BookingHoldMapper.toDomain(row) : null;
  }

  async updateStatus(id: string, status: BookingHoldStatus): Promise<void> {
    await this.holdRepo.update({ id }, { status });
  }

  existsLiveInWindow(
    doctorId: string,
    after: Date,
    before: Date,
    now: Date,
  ): Promise<boolean> {
    const window = And(MoreThan(after), LessThan(before));

    // An array of `where` objects is OR'd by TypeORM. Payment-pending holds
    // carry no expiry test on purpose; see the port's doc comment.
    return this.holdRepo.exists({
      where: [
        {
          doctorId,
          status: BookingHoldStatus.PAYMENT_PENDING,
          scheduledAt: window,
        },
        {
          doctorId,
          status: BookingHoldStatus.HELD,
          expiresAt: MoreThan(now),
          scheduledAt: window,
        },
      ],
    });
  }
}
