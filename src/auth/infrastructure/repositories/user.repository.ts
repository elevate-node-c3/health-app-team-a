import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from 'src/auth/domain/entities/user.model';
import { UserRepository } from 'src/auth/domain/repositories/user.repository';
import { UserOrmEntity } from 'src/auth/infrastructure/entities/typeorm/user.entity';
import { UserMapper } from 'src/auth/infrastructure/mappers/user.mapper';
import { Repository } from 'typeorm';

@Injectable()
export class TypeOrmUserRepository implements UserRepository {
  constructor(
    @InjectRepository(UserOrmEntity)
    private readonly ormRepo: Repository<UserOrmEntity>,
  ) {}

  async findById(id: string): Promise<User | null> {
    const ormEntity = await this.ormRepo.findOneBy({ id });
    return ormEntity ? UserMapper.toDomain(ormEntity) : null;
  }
  async findByEmail(email: string): Promise<User | null> {
    const ormEntity = await this.ormRepo.findOneBy({ email });
    return ormEntity ? UserMapper.toDomain(ormEntity) : null;
  }
  async findByPhone(phone: string): Promise<User | null> {
    const ormEntity = await this.ormRepo.findOneBy({ phone });
    return ormEntity ? UserMapper.toDomain(ormEntity) : null;
  }
  async findByEmailOrPhone(email: string, phone: string): Promise<User[]> {
    const ormEntities = await this.ormRepo.find({
      where: [
        { email },
        { phone }
      ]
    });
    return ormEntities.map(ormEntity => UserMapper.toDomain(ormEntity));
  }

  async findAll(skip: number, take: number): Promise<[User[], number]> {
    const [ormEntities, count] = await this.ormRepo.findAndCount({
      skip,
      take,
    });
    return [ormEntities.map(ormEntity => UserMapper.toDomain(ormEntity)), count];
  }

  async save(user: User): Promise<void> {
    const ormEntity = UserMapper.toOrmEntity(user);
    await this.ormRepo.save(ormEntity);
  }
}
