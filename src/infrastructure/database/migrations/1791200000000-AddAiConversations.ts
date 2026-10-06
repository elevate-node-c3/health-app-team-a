import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAiConversations1791200000000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE ai_conversations (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner varchar NOT NULL, "createdAt" timestamptz NOT NULL DEFAULT now());
      CREATE INDEX ON ai_conversations(owner);
      CREATE TABLE ai_messages (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), "conversationId" uuid NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE, "requestId" uuid NOT NULL, input text NOT NULL, content text NOT NULL DEFAULT '', outcome varchar NOT NULL DEFAULT 'streaming', suggestion jsonb, metrics jsonb, "createdAt" timestamptz NOT NULL DEFAULT now(), UNIQUE("conversationId", "requestId"));
      CREATE INDEX ON ai_messages("conversationId", "createdAt");
      CREATE TABLE ai_daily_usage (owner varchar NOT NULL, day date NOT NULL, count integer NOT NULL, PRIMARY KEY(owner, day));`);
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query(
      'DROP TABLE ai_daily_usage; DROP TABLE ai_messages; DROP TABLE ai_conversations',
    );
  }
}
