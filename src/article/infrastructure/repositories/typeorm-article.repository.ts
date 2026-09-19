import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Article } from 'src/article/domain/entities/article.model';
import { ArticleRepository } from 'src/article/domain/repositories/article.repository';
import { ArticleOrmEntity } from 'src/article/infrastructure/entities/typeorm/article.entity';
import { ArticleMapper } from 'src/article/infrastructure/mappers/article.mapper';
import { Repository } from 'typeorm';

@Injectable()
export class TypeOrmArticleRepository implements ArticleRepository {
  constructor(
    @InjectRepository(ArticleOrmEntity)
    private readonly articleRepo: Repository<ArticleOrmEntity>,
  ) {}

  async findNewestPublished(limit: number): Promise<Article[]> {
    const ormEntities = await this.articleRepo.find({
      where: { isPublished: true },
      order: { publishedAt: 'DESC', id: 'ASC' },
      take: limit,
    });

    return ormEntities.map((ormEntity) => ArticleMapper.toDomain(ormEntity));
  }

  async findPublishedPaginated(
    page: number,
    limit: number,
  ): Promise<[Article[], number]> {
    const [ormEntities, total] = await this.articleRepo.findAndCount({
      where: { isPublished: true },
      order: { publishedAt: 'DESC', id: 'ASC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return [
      ormEntities.map((ormEntity) => ArticleMapper.toDomain(ormEntity)),
      total,
    ];
  }

  async findPublishedById(id: string): Promise<Article | null> {
    const ormEntity = await this.articleRepo.findOneBy({
      id,
      isPublished: true,
    });
    return ormEntity ? ArticleMapper.toDomain(ormEntity) : null;
  }
}
