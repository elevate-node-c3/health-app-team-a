import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSearchHistoryAndIndexes1789731625345 implements MigrationInterface {
  name = 'AddSearchHistoryAndIndexes1789731625345';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "search_histories" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "ownerKey" character varying NOT NULL, "term" character varying(500) NOT NULL, "normalizedTerm" character varying(500) NOT NULL, "createdAt" TIMESTAMP NOT NULL, CONSTRAINT "PK_55eb6ed37ed8a334b599b3dfe66" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_cc49f70879eab8868be686098d" ON "search_histories" ("ownerKey", "createdAt") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_ee2120caec7843ec5dd4218fd8" ON "search_histories" ("ownerKey", "normalizedTerm") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_ee2120caec7843ec5dd4218fd8"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_cc49f70879eab8868be686098d"`,
    );
    await queryRunner.query(`DROP TABLE "search_histories"`);
  }
}
