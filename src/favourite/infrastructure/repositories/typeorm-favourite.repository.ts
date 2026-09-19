import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FavouriteRepository } from 'src/favourite/domain/repositories/favourite.repository';
import { FavouriteOrmEntity } from 'src/favourite/infrastructure/entities/typeorm/favourite.entity';
import { In, Repository } from 'typeorm';

@Injectable()
export class TypeOrmFavouriteRepository implements FavouriteRepository {
  constructor(
    @InjectRepository(FavouriteOrmEntity)
    private readonly favouriteRepo: Repository<FavouriteOrmEntity>,
  ) {}

  async findFavouritedDoctorIds(
    userId: string,
    doctorIds: string[],
  ): Promise<Set<string>> {
    if (doctorIds.length === 0) return new Set();

    const rows = await this.favouriteRepo.find({
      where: { userId, doctorId: In(doctorIds) },
      select: { doctorId: true },
    });

    return new Set(rows.map((row) => row.doctorId));
  }

  async add(userId: string, doctorId: string): Promise<void> {
    if (await this.favouriteRepo.existsBy({ userId, doctorId })) return;
    await this.favouriteRepo.save(
      this.favouriteRepo.create({ userId, doctorId }),
    );
  }

  async remove(userId: string, doctorId: string): Promise<void> {
    await this.favouriteRepo.delete({ userId, doctorId });
  }

  async exists(userId: string, doctorId: string): Promise<boolean> {
    return this.favouriteRepo.existsBy({ userId, doctorId });
  }
}
