import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { User } from '../../domain/entities/user.model';
import { UserRepository } from '../../domain/repositories/user.repository';
import { UserOrmEntity } from '../entities/typeorm/user.entity';
import { UserMapper } from '../mappers/user.mapper';

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

  async save(user: User): Promise<void> {
    const ormEntity = UserMapper.toOrmEntity(user);
    await this.ormRepo.save(ormEntity);
  }
}
