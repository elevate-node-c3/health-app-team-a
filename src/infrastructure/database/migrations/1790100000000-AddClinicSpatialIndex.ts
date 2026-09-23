import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddClinicSpatialIndex1790100000000 implements MigrationInterface {
  name = 'AddClinicSpatialIndex1790100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // PostGIS provides the spatial types, functions and GiST index.
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS postgis`);

    // A STORED generated column kept in sync automatically from the existing
    // latitude/longitude columns (ST_MakePoint / ST_SetSRID are immutable), so
    // no application write path has to change. Longitude is X, latitude is Y.
    await queryRunner.query(
      `ALTER TABLE "clinics" ADD COLUMN "location" geography(Point, 4326) GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint("longitude", "latitude"), 4326)::geography) STORED`,
    );

    // GiST index makes bounds ("Search This Area") and radius queries use an
    // index scan instead of scanning every clinic.
    await queryRunner.query(
      `CREATE INDEX "IDX_clinics_location" ON "clinics" USING GIST ("location")`,
    );
  }
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_clinics_location"`);
    await queryRunner.query(`ALTER TABLE "clinics" DROP COLUMN "location"`);
    // Extension is intentionally left installed — other objects may rely on it.
  }
}
