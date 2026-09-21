import { Module } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';

import { FAVORIT_DOCTOR_REPOSITORY } from './domain/repositories/favorite-doctor.repository';
import { FavoriteController } from './favorite.controller';
import { FavoriteService } from './favorite.service';
import { FavoriteDoctorOrmEntity } from './infrastructure/entities/favorite-doctor.entity';
import { TypeOrmFavoriteDoctorRepo } from './infrastructure/repositories/typeorm-favorite-doctor.repository';

import { AuthModule } from '@/auth/auth.module';
import { SESSION_REPOSITORY } from '@/auth/domain/repositories/session.repository';
import { SessionOrmEntity } from '@/auth/infrastructure/entities/typeorm/session.entity';
import { TokenOrmEntity } from '@/auth/infrastructure/entities/typeorm/token.entity';
import { TypeOrmSessionRepository } from '@/auth/infrastructure/repositories/session.repository';

@Module({
  imports: [
    AuthModule,
    TypeOrmModule.forFeature([
      FavoriteDoctorOrmEntity,
      SessionOrmEntity,
      TokenOrmEntity,
    ]),
  ],
  controllers: [FavoriteController],
  providers: [
    JwtService,
    FavoriteService,
    { provide: FAVORIT_DOCTOR_REPOSITORY, useClass: TypeOrmFavoriteDoctorRepo },
    { provide: SESSION_REPOSITORY, useClass: TypeOrmSessionRepository },
  ],
  exports: [FAVORIT_DOCTOR_REPOSITORY, SESSION_REPOSITORY],
})
export class FavoriteModule {}
