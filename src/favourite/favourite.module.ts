import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from 'src/auth/auth.module';
import { DoctorOrmEntity } from 'src/doctor/infrastructure/entities/typeorm/doctor.entity';
import { MessagingModule } from 'src/infrastructure/messaging/messaging.module';

import { FAVOURITE_REPOSITORY } from './domain/repositories/favourite.repository';
import { FavouriteController } from './favourite.controller';
import { FavouriteService } from './favourite.service';
import { FavouriteOrmEntity } from './infrastructure/entities/typeorm/favourite.entity';
import { TypeOrmFavouriteRepository } from './infrastructure/repositories/typeorm-favourite.repository';

@Module({
  imports: [
    AuthModule,
    MessagingModule,
    TypeOrmModule.forFeature([FavouriteOrmEntity, DoctorOrmEntity]),
  ],
  controllers: [FavouriteController],
  providers: [
    FavouriteService,
    { provide: FAVOURITE_REPOSITORY, useClass: TypeOrmFavouriteRepository },
  ],
  exports: [FAVOURITE_REPOSITORY],
})
export class FavouriteModule {}
