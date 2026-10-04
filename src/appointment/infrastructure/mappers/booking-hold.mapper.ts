import { BookingHold } from 'src/appointment/domain/entities/booking-hold.model';

import type { BookingHoldOrmEntity } from 'src/appointment/infrastructure/entities/typeorm/booking-hold.entity';

export class BookingHoldMapper {
  static toDomain(ormEntity: BookingHoldOrmEntity): BookingHold {
    return new BookingHold(
      ormEntity.id,
      ormEntity.userId,
      ormEntity.doctorId,
      ormEntity.clinicId,
      ormEntity.scheduledAt,
      // Left as the string the `numeric` column returns - this is money that
      // gets quoted to the provider verbatim, so it must not pass through a
      // float.
      ormEntity.frozenAmount,
      ormEntity.status,
      ormEntity.expiresAt,
      ormEntity.reschedulesAppointmentId,
      ormEntity.createdAt,
      ormEntity.updatedAt,
    );
  }
}
