import { Clinic } from 'src/doctor/domain/entities/clinic.model';
import { ClinicOrmEntity } from 'src/doctor/infrastructure/entities/typeorm/clinic.entity';

export class ClinicMapper {
  static toDomain(ormEntity: ClinicOrmEntity): Clinic {
    return new Clinic(
      ormEntity.id,
      ormEntity.name,
      ormEntity.placeType,
      ormEntity.governorate,
      ormEntity.city,
      Number(ormEntity.latitude),
      Number(ormEntity.longitude),
      ormEntity.isActive,
      ormEntity.createdAt,
      ormEntity.updatedAt,
    );
  }
}
