import { Specialty } from 'src/doctor/domain/entities/specialty.model';
import { SpecialtyOrmEntity } from 'src/doctor/infrastructure/entities/typeorm/specialty.entity';

export class SpecialtyMapper {
  static toDomain(ormEntity: SpecialtyOrmEntity): Specialty {
    return new Specialty(
      ormEntity.id,
      ormEntity.name,
      ormEntity.createdAt,
      ormEntity.updatedAt,
    );
  }
}
