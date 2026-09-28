import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { BookingOrmEntity } from '../entities/typeorm/booking.entity';

import { Booking } from '@/appointment/domain/entities/booking.model';
import { BookingStatus } from '@/appointment/domain/enums/booking-status.enum';
import { BookingRepo } from '@/appointment/domain/repositories/booking.repository';
import { BookingDto } from '@/appointment/dto/booking.dto';

@Injectable()
export class TypeOrmBookingRepo implements BookingRepo {
  constructor(
    @InjectRepository(BookingOrmEntity)
    private readonly bookingOrmRepo: Repository<BookingOrmEntity>,
  ) {}

  async create(input: BookingDto): Promise<Booking> {
    const bookingOrm = this.bookingOrmRepo.create({
      userId: input.userId,
      slotId: input.slotId,
      status: BookingStatus.PENDING,
    });

    const saved = await this.bookingOrmRepo.save(bookingOrm);

    return this.toDomain(saved);
  }

  async findAll(): Promise<Booking[]> {
    const bookingsOrm = await this.bookingOrmRepo.find();

    return bookingsOrm.map((entity) => this.toDomain(entity));
  }

  async findById(id: string): Promise<Booking> {
    const entity = await this.bookingOrmRepo.findOne({
      where: { id },
    });

    if (!entity) {
      throw new Error(`Booking with id ${id} not found`);
    }

    return this.toDomain(entity);
  }
  async save(booking: Booking): Promise<void> {
    await this.bookingOrmRepo.save(booking);
  }

  private toDomain(entity: BookingOrmEntity): Booking {
    return new Booking(
      entity.id,
      entity.userId,
      entity.slotId,
      entity.expiresAt,
      entity.status as BookingStatus,
      entity.createdAt,
      entity.updatedAt,
    );
  }
}
