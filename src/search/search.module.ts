import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from 'src/auth/auth.module';
import { DoctorOrmEntity } from 'src/doctor/infrastructure/entities/typeorm/doctor.entity';
import { SpecialtyOrmEntity } from 'src/doctor/infrastructure/entities/typeorm/specialty.entity';

import { SEARCH_HISTORY_REPOSITORY } from './domain/repositories/search-history.repository';
import { SEARCH_REPOSITORY } from './domain/repositories/search.repository';
import { SearchHistoryOrmEntity } from './infrastructure/entities/typeorm/search-history.entity';
import { TypeOrmSearchHistoryRepository } from './infrastructure/repositories/typeorm-search-history.repository';
import { TypeOrmSearchRepository } from './infrastructure/repositories/typeorm-search.repository';
import { SearchController } from './search.controller';
import { SearchEventPublisher } from './search.events';
import { SearchService } from './search.service';

@Module({
  imports: [
    AuthModule,
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
    SearchEventPublisher,
  ],
  exports: [SearchService],
})
export class SearchModule {}
