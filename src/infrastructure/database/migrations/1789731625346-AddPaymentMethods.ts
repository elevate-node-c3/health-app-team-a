import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPaymentMethods1789731625346 implements MigrationInterface {
  name = 'AddPaymentMethods1789731625346';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "payment_methods" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid NOT NULL, "providerRef" character varying NOT NULL, "brand" character varying NOT NULL, "last4" character varying(4) NOT NULL, "holderName" character varying NOT NULL, "expiryMonth" smallint NOT NULL, "expiryYear" smallint NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_payment_methods_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_payment_methods_user_card" ON "payment_methods" ("userId", "brand", "last4", "expiryMonth", "expiryYear") `,
    );
    await queryRunner.query(
      `ALTER TABLE "payment_methods" ADD CONSTRAINT "FK_payment_methods_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "payment_methods" DROP CONSTRAINT "FK_payment_methods_user"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_payment_methods_user_card"`,
    );
    await queryRunner.query(`DROP TABLE "payment_methods"`);
  }
}
