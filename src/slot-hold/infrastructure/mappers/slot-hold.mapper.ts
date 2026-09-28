import { SlotHold } from 'src/slot-hold/domain/entities/slot-hold.model';
import { SlotHoldOrmEntity } from 'src/slot-hold/infrastructure/entities/typeorm/slot-hold.entity';

export class SlotHoldMapper {
  static toDomain(ormEntity: SlotHoldOrmEntity): SlotHold {
    return new SlotHold(
      ormEntity.id,
      ormEntity.userId,
      ormEntity.doctorId,
      ormEntity.clinicId,
      ormEntity.scheduledAt,
      Number(ormEntity.feeAmount),
      ormEntity.status,
      ormEntity.expiresAt,
      ormEntity.extended,
      ormEntity.appointmentId,
      ormEntity.createdAt,
      ormEntity.updatedAt,
    );
  }
}
