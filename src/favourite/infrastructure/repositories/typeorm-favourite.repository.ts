import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DoctorOrmEntity } from 'src/doctor/infrastructure/entities/typeorm/doctor.entity';
import { FavouriteRepository } from 'src/favourite/domain/repositories/favourite.repository';
import { FavouriteOrmEntity } from 'src/favourite/infrastructure/entities/typeorm/favourite.entity';
import { In, Repository } from 'typeorm';

@Injectable()
export class TypeOrmFavouriteRepository implements FavouriteRepository {
  constructor(
    @InjectRepository(FavouriteOrmEntity)
    private readonly favouriteRepo: Repository<FavouriteOrmEntity>,
    @InjectRepository(DoctorOrmEntity)
    private readonly doctorRepo: Repository<DoctorOrmEntity>,
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

  async add(userId: string, doctorId: string): Promise<boolean> {
    const result = await this.favouriteRepo
      .createQueryBuilder()
      .insert()
      .into(FavouriteOrmEntity)
      .values({ userId, doctorId })
      .orIgnore()
      .returning('"userId"')
      .execute();
    return (result.raw as unknown[]).length > 0;
  }

  async findDoctorName(doctorId: string): Promise<string | null> {
    const doctor = await this.doctorRepo.findOne({
      where: { id: doctorId },
      select: { name: true },
    });
    return doctor?.name ?? null;
  }

  async remove(userId: string, doctorId: string): Promise<void> {
    await this.favouriteRepo.delete({ userId, doctorId });
  }

  async exists(userId: string, doctorId: string): Promise<boolean> {
    return this.favouriteRepo.existsBy({ userId, doctorId });
  }
}
