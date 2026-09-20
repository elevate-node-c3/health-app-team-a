import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { FAVORIT_DOCTOR_REPOSITORY } from './domain/repositories/favorite-doctor.repository';
import { FavoriteController } from './favorite.controller';
import { FavoriteService } from './favorite.service';
import { FavoriteDoctorOrmEntity } from './infrastructure/entities/favorite-doctor.entity';
import { TypeOrmFavoriteDoctorRepo } from './infrastructure/repositories/typeorm-favorite-doctor.repository';

import { AuthModule } from '@/auth/auth.module';

@Module({
  imports: [AuthModule, TypeOrmModule.forFeature([FavoriteDoctorOrmEntity])],
  controllers: [FavoriteController],
  providers: [
    FavoriteService,
    { provide: FAVORIT_DOCTOR_REPOSITORY, useClass: TypeOrmFavoriteDoctorRepo },
  ],
  exports: [FAVORIT_DOCTOR_REPOSITORY],
})
export class FavoriteModule {}
