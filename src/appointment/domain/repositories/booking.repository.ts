import { Booking } from '../entities/booking.model';

import { BookingDto } from '@/appointment/dto/booking.dto';

export interface BookingRepo {
  create(input: BookingDto): Promise<Booking>;
  findAll(): Promise<Booking[]>;
  findById(id: string): Promise<Booking>;
}

export const BOOKING_REPO = Symbol('BOOKING_REPO');
