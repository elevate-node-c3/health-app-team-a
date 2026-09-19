import { jest } from '@jest/globals';
import { NotFoundException } from '@nestjs/common';

import { ArticleService } from './article.service';
import { Article } from './domain/entities/article.model';

function makeArticle(id: string, isPublished = true): Article {
  return new Article(
    id,
    `Title ${id}`,
    `slug-${id}`,
    `Excerpt ${id}`,
    'Body',
    null,
    isPublished,
    new Date('2026-09-01T00:00:00Z'),
    'Dr. Author',
    new Date(),
    new Date(),
  );
}

describe('ArticleService', () => {
  let articleRepository: {
    findNewestPublished: jest.Mock;
    findPublishedPaginated: jest.Mock;
    findPublishedById: jest.Mock;
  };
  let service: ArticleService;

  beforeEach(() => {
    articleRepository = {
      findNewestPublished: jest.fn(),
      findPublishedPaginated: jest.fn(),
      findPublishedById: jest.fn(),
    };
    service = new ArticleService(articleRepository as never);
  });

  it('returns the standard { data, meta } envelope for the list', async () => {
    articleRepository.findPublishedPaginated.mockResolvedValue([
      [makeArticle('a1'), makeArticle('a2')],
      23,
    ]);

    const result = await service.listPublished(2, 10);

    expect(articleRepository.findPublishedPaginated).toHaveBeenCalledWith(
      2,
      10,
    );
    expect(result.data).toHaveLength(2);
    expect(result.data[0]).not.toHaveProperty('body'); // teaser only
    expect(result.meta).toEqual({
      total: 23,
      page: 2,
      limit: 10,
      totalPages: 3,
    });
  });

  it('returns full detail for a published article', async () => {
    articleRepository.findPublishedById.mockResolvedValue(makeArticle('a1'));

    const detail = await service.getPublishedById('a1');

    expect(detail).toMatchObject({ id: 'a1', body: 'Body' });
  });

  it('404s when the article is missing or unpublished (BR-07)', async () => {
    articleRepository.findPublishedById.mockResolvedValue(null);

    await expect(service.getPublishedById('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
