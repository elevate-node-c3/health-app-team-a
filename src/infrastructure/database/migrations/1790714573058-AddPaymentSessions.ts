import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPaymentSessions1790714573058 implements MigrationInterface {
  name = 'AddPaymentSessions1790714573058';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "payment_sessions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" uuid NOT NULL,
        "paymentAttemptId" uuid NOT NULL,
        "holdId" uuid NOT NULL,
        "appointmentId" uuid,
        "doctorId" uuid NOT NULL,
        "clinicId" uuid NOT NULL,
        "scheduledAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "stripePaymentIntentId" character varying,
        "amount" numeric(10,2) NOT NULL,
        "currency" character varying NOT NULL DEFAULT 'EGP',
        "status" character varying NOT NULL,
        "metadata" jsonb,
        "failureReason" character varying,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_payment_sessions_attempt" UNIQUE ("paymentAttemptId"),
        CONSTRAINT "PK_payment_sessions" PRIMARY KEY ("id")
      )`,
    );

    await queryRunner.query(
      `CREATE INDEX "IDX_payment_sessions_user_attempt"
       ON "payment_sessions" ("userId", "paymentAttemptId")`,
    );

    await queryRunner.query(
      `CREATE INDEX "IDX_payment_sessions_hold"
       ON "payment_sessions" ("holdId")`,
    );

    await queryRunner.query(
      `CREATE INDEX "IDX_payment_sessions_status_updated"
       ON "payment_sessions" ("status", "updatedAt")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_payment_sessions_status_updated"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_payment_sessions_hold"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_payment_sessions_user_attempt"`,
    );
    await queryRunner.query(`DROP TABLE "payment_sessions"`);
  }
}
