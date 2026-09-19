export class Article {
  constructor(
    public readonly id: string,
    public title: string,
    public slug: string,
    public excerpt: string,
    public body: string,
    public coverImage: string | null,
    public isPublished: boolean,
    public publishedAt: Date | null,
    public authorName: string,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
  ) {}
}
