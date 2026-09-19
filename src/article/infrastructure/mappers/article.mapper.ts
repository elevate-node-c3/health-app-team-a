import { Article } from 'src/article/domain/entities/article.model';
import { ArticleOrmEntity } from 'src/article/infrastructure/entities/typeorm/article.entity';

export class ArticleMapper {
  static toDomain(ormEntity: ArticleOrmEntity): Article {
    return new Article(
      ormEntity.id,
      ormEntity.title,
      ormEntity.slug,
      ormEntity.excerpt,
      ormEntity.body,
      ormEntity.coverImage,
      ormEntity.isPublished,
      ormEntity.publishedAt,
      ormEntity.authorName,
      ormEntity.createdAt,
      ormEntity.updatedAt,
    );
  }
}
