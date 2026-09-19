import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { paginate, Paginated } from 'src/common/utils/pagination.util';

import { Article } from './domain/entities/article.model';
import { ARTICLE_REPOSITORY } from './domain/repositories/article.repository';

import type { ArticleRepository } from './domain/repositories/article.repository';

export interface ArticleTeaser {
  id: string;
  title: string;
  excerpt: string;
  coverImage: string | null;
  publishedAt: Date | null;
  authorName: string;
}

export interface ArticleDetail extends ArticleTeaser {
  body: string;
}

@Injectable()
export class ArticleService {
  constructor(
    @Inject(ARTICLE_REPOSITORY)
    private readonly articleRepository: ArticleRepository,
  ) {}

  async newestTeasers(limit: number): Promise<ArticleTeaser[]> {
    const articles = await this.articleRepository.findNewestPublished(limit);
    return articles.map((article) => this.toTeaser(article));
  }

  async listPublished(
    page: number,
    limit: number,
  ): Promise<Paginated<ArticleTeaser>> {
    const [articles, total] =
      await this.articleRepository.findPublishedPaginated(page, limit);
    return paginate(
      articles.map((article) => this.toTeaser(article)),
      total,
      page,
      limit,
    );
  }

  async getPublishedById(id: string): Promise<ArticleDetail> {
    const article = await this.articleRepository.findPublishedById(id);
    if (!article) throw new NotFoundException('Article not found');
    return this.toDetail(article);
  }

  toTeaser(article: Article): ArticleTeaser {
    return {
      id: article.id,
      title: article.title,
      excerpt: article.excerpt,
      coverImage: article.coverImage,
      publishedAt: article.publishedAt,
      authorName: article.authorName,
    };
  }

  private toDetail(article: Article): ArticleDetail {
    return { ...this.toTeaser(article), body: article.body };
  }
}
