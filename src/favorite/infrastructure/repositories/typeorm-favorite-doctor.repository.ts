import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { FavoriteDoctorOrmEntity } from '../entities/favorite-doctor.entity';
import { FavoriteDoctorMapper } from '../mappers/favorite-doctor.mapper';

import { FavoriteDoctor } from '@/favorite/domain/entitties/favorite-doctor.model';
import { FavoriteDoctorRepo } from '@/favorite/domain/repositories/favorite-doctor.repository';
import { FavoriteDoctorDTO } from '@/favorite/dto/favorite-doctor.dto';

@Injectable()
export class TypeOrmFavoriteDoctorRepo implements FavoriteDoctorRepo {
  constructor(
    @InjectRepository(FavoriteDoctorOrmEntity)
    private readonly favoriteDoctorRepo: Repository<FavoriteDoctorOrmEntity>,
  ) {}

  async addFavoriteDcotor(input: FavoriteDoctorDTO): Promise<FavoriteDoctor> {
    const ormEntity = this.favoriteDoctorRepo.create(input);
    return FavoriteDoctorMapper.toDomain(
      await this.favoriteDoctorRepo.save(ormEntity),
    );
  }
  async findFavoriteDoctors(userID: string): Promise<FavoriteDoctor[]> {
    const ormEntities = await this.favoriteDoctorRepo.findBy({ userID });
    const favoriteDoctores = ormEntities.map((ormEntity) =>
      FavoriteDoctorMapper.toDomain(ormEntity),
    );
    return favoriteDoctores;
  }
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  async removeFavoriteDoctor(doctorID: string): Promise<void> {
    await this.favoriteDoctorRepo.delete({ doctorID });
  }
}
