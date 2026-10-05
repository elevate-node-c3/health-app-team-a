import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from 'src/auth/auth.module';
import { DoctorOrmEntity } from 'src/doctor/infrastructure/entities/typeorm/doctor.entity';
import { SpecialtyOrmEntity } from 'src/doctor/infrastructure/entities/typeorm/specialty.entity';
import { MessagingModule } from 'src/infrastructure/messaging/messaging.module';

import { SEARCH_HISTORY_REPOSITORY } from './domain/repositories/search-history.repository';
import { SEARCH_REPOSITORY } from './domain/repositories/search.repository';
import { SearchHistoryOrmEntity } from './infrastructure/entities/typeorm/search-history.entity';
import { TypeOrmSearchHistoryRepository } from './infrastructure/repositories/typeorm-search-history.repository';
import { TypeOrmSearchRepository } from './infrastructure/repositories/typeorm-search.repository';
import { MapSearchAnalyticsListener } from './map-search.events';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';

@Module({
  imports: [
    AuthModule,
    MessagingModule,
    TypeOrmModule.forFeature([
      SpecialtyOrmEntity,
      DoctorOrmEntity,
      SearchHistoryOrmEntity,
    ]),
  ],
  controllers: [SearchController],
  providers: [
    { provide: SEARCH_REPOSITORY, useClass: TypeOrmSearchRepository },
    {
      provide: SEARCH_HISTORY_REPOSITORY,
      useClass: TypeOrmSearchHistoryRepository,
    },
    SearchService,
    MapSearchAnalyticsListener,
  ],
  exports: [SearchService],
})
export class SearchModule {}
