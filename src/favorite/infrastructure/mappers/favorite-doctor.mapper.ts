import { FavoriteDoctorOrmEntity } from '../entities/favorite-doctor.entity';

import { FavoriteDoctor } from '@/favorite/domain/entitties/favorite-doctor.model';

export class FavoriteDoctorMapper {
  static toDomain(ormEntity: FavoriteDoctorOrmEntity): FavoriteDoctor {
    return new FavoriteDoctor(
      ormEntity.id,
      ormEntity.userID,
      ormEntity.doctorID,
      ormEntity.createdAt,
      ormEntity.updatedAt,
    );
  }
}
