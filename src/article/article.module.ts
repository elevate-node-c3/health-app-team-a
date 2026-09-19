import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ArticleController } from './article.controller';
import { ArticleService } from './article.service';
import { ARTICLE_REPOSITORY } from './domain/repositories/article.repository';
import { ArticleOrmEntity } from './infrastructure/entities/typeorm/article.entity';
import { TypeOrmArticleRepository } from './infrastructure/repositories/typeorm-article.repository';

@Module({
  imports: [TypeOrmModule.forFeature([ArticleOrmEntity])],
  controllers: [ArticleController],
  providers: [
    ArticleService,
    { provide: ARTICLE_REPOSITORY, useClass: TypeOrmArticleRepository },
  ],
  exports: [ARTICLE_REPOSITORY, ArticleService],
})
export class ArticleModule {}
