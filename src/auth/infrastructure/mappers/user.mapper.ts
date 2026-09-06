import { User } from '../../domain/entities/user.model';
import { UserOrmEntity } from '../entities/typeorm/user.entity';

export class UserMapper {
  static toDomain(ormEntity: UserOrmEntity): User {
    return new User(
      ormEntity.id,
      ormEntity.name,
      ormEntity.email,
      ormEntity.phone,
      ormEntity.gender,
      ormEntity.isActive,
      ormEntity.isVerified,
      ormEntity.createdAt,
      ormEntity.updatedAt,
      ormEntity.password,
    );
  }

  static toOrmEntity(domainUser: User): UserOrmEntity {
    const ormEntity = new UserOrmEntity();
    ormEntity.id = domainUser.id;
    ormEntity.email = domainUser.email;
    ormEntity.phone = domainUser.phone;
    ormEntity.password = domainUser.getPasswordHash();
    ormEntity.gender = domainUser.gender;
    ormEntity.name = domainUser.name;
    ormEntity.createdAt = domainUser.createdAt;
    return ormEntity;
  }
}
