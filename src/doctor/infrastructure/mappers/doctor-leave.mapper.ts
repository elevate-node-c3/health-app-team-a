import { DoctorLeave } from 'src/doctor/domain/entities/doctor-leave.model';
import { DoctorLeaveOrmEntity } from 'src/doctor/infrastructure/entities/typeorm/doctor-leave.entity';

export class DoctorLeaveMapper {
  static toDomain(ormEntity: DoctorLeaveOrmEntity): DoctorLeave {
    return new DoctorLeave(
      ormEntity.id,
      ormEntity.doctorId,
      ormEntity.startDate,
      ormEntity.endDate,
      ormEntity.reason,
      ormEntity.createdAt,
      ormEntity.updatedAt,
    );
  }
}
