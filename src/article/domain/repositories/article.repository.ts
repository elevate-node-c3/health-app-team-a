import { Article } from 'src/article/domain/entities/article.model';

export interface ArticleRepository {
  /**
   * Newest published articles for the Home teaser.
   */
  findNewestPublished(limit: number): Promise<Article[]>;

  /**
   * A page of published articles for the full-list screen.
   */
  findPublishedPaginated(
    page: number,
    limit: number,
  ): Promise<[Article[], number]>;

  /** A single published article for the detail view. */
  findPublishedById(id: string): Promise<Article | null>;
}

export const ARTICLE_REPOSITORY = Symbol('ARTICLE_REPOSITORY');
