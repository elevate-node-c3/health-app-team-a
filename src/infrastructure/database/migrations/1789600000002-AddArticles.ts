import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddArticles1789600000002 implements MigrationInterface {
  name = 'AddArticles1789600000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "articles" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "title" character varying NOT NULL, "slug" character varying NOT NULL, "excerpt" character varying NOT NULL, "body" text NOT NULL, "coverImage" character varying, "isPublished" boolean NOT NULL DEFAULT false, "publishedAt" TIMESTAMP WITH TIME ZONE, "authorName" character varying NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_articles_slug" UNIQUE ("slug"), CONSTRAINT "PK_articles_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_articles_published_publishedAt" ON "articles" ("isPublished", "publishedAt") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_articles_published_publishedAt"`,
    );
    await queryRunner.query(`DROP TABLE "articles"`);
  }
}
