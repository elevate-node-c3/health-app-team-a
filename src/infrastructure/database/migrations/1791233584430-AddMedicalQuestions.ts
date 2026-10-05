import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMedicalQuestions1791233584430 implements MigrationInterface {
  name = 'AddMedicalQuestions1791233584430';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "medical_questions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid NOT NULL, "concern" character varying(50) NOT NULL, "symptoms" character varying(250) NOT NULL, "gender" character varying NOT NULL, "age" smallint NOT NULL, "isEmergency" boolean NOT NULL DEFAULT false, "status" character varying NOT NULL, "askedAt" TIMESTAMP WITH TIME ZONE NOT NULL, "escalatedAt" TIMESTAMP WITH TIME ZONE, "notifiedAt" TIMESTAMP WITH TIME ZONE, "answerText" text, "answeredAt" TIMESTAMP WITH TIME ZONE, "deletedAt" TIMESTAMP WITH TIME ZONE, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_medical_questions_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_medical_questions_user_deleted" ON "medical_questions" ("userId", "deletedAt")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_medical_questions_unanswered_asked" ON "medical_questions" ("askedAt") WHERE "answeredAt" IS NULL AND "deletedAt" IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "medical_questions" ADD CONSTRAINT "FK_medical_questions_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "medical_questions" DROP CONSTRAINT "FK_medical_questions_user"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_medical_questions_unanswered_asked"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_medical_questions_user_deleted"`,
    );
    await queryRunner.query(`DROP TABLE "medical_questions"`);
  }
}
