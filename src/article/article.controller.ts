import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';

import { ArticleService } from './article.service';
import { ListArticlesQueryDto } from './dto/list-articles-query.dto';

@Controller('articles')
export class ArticleController {
  constructor(private readonly articleService: ArticleService) {}

  @Get()
  async list(@Query() dto: ListArticlesQueryDto) {
    return this.articleService.listPublished(dto.page, dto.limit);
  }

  @Get(':id')
  async detail(@Param('id', ParseUUIDPipe) id: string) {
    return this.articleService.getPublishedById(id);
  }
}
