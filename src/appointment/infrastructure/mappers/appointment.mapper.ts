import { Appointment } from 'src/appointment/domain/entities/appointment.model';
import { AppointmentOrmEntity } from 'src/appointment/infrastructure/entities/typeorm/appointment.entity';

export class AppointmentMapper {
  static toDomain(ormEntity: AppointmentOrmEntity): Appointment {
    return new Appointment(
      ormEntity.id,
      ormEntity.userId,
      ormEntity.doctorId,
      ormEntity.clinicId,
      ormEntity.scheduledAt,
      ormEntity.status,
      ormEntity.createdAt,
      ormEntity.updatedAt,
    );
  }
}
