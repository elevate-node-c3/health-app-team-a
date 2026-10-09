import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAiCostTracking1791300000000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE ai_cost_tracking (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        owner varchar NOT NULL,
        day date NOT NULL,
        month varchar NOT NULL,
        cost_usd numeric NOT NULL,
        "createdAt" timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX ON ai_cost_tracking(month);
      CREATE INDEX ON ai_cost_tracking(owner, day);
      
      CREATE TABLE ai_monthly_budgets (
        month varchar PRIMARY KEY,
        spent_usd numeric NOT NULL DEFAULT 0
      );
    `);
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE ai_cost_tracking;');
  }
}
