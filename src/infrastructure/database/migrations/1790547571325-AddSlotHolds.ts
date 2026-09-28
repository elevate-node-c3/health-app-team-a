import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSlotHolds1790547571325 implements MigrationInterface {
  name = 'AddSlotHolds1790547571325';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "slot_holds" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid NOT NULL, "doctorId" uuid NOT NULL, "clinicId" uuid NOT NULL, "scheduledAt" TIMESTAMP WITH TIME ZONE NOT NULL, "feeAmount" numeric(10,2) NOT NULL, "status" character varying NOT NULL, "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL, "extended" boolean NOT NULL DEFAULT false, "appointmentId" uuid, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_slot_holds_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_slot_holds_active_slot" ON "slot_holds" ("doctorId", "clinicId", "scheduledAt") WHERE "status" = 'ACTIVE'`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_slot_holds_status_expires" ON "slot_holds" ("status", "expiresAt") `,
    );
    await queryRunner.query(
      `ALTER TABLE "slot_holds" ADD CONSTRAINT "FK_slot_holds_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "slot_holds" ADD CONSTRAINT "FK_slot_holds_doctor" FOREIGN KEY ("doctorId") REFERENCES "doctors"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "slot_holds" ADD CONSTRAINT "FK_slot_holds_clinic" FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "slot_holds" ADD CONSTRAINT "FK_slot_holds_appointment" FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "slot_holds" DROP CONSTRAINT "FK_slot_holds_appointment"`,
    );
    await queryRunner.query(
      `ALTER TABLE "slot_holds" DROP CONSTRAINT "FK_slot_holds_clinic"`,
    );
    await queryRunner.query(
      `ALTER TABLE "slot_holds" DROP CONSTRAINT "FK_slot_holds_doctor"`,
    );
    await queryRunner.query(
      `ALTER TABLE "slot_holds" DROP CONSTRAINT "FK_slot_holds_user"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_slot_holds_status_expires"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_slot_holds_active_slot"`);
    await queryRunner.query(`DROP TABLE "slot_holds"`);
  }
}
