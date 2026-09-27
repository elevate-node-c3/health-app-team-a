import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPaymentBookingFlow1789800000000 implements MigrationInterface {
  name = 'AddPaymentBookingFlow1789800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "booking_holds" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid NOT NULL, "doctorId" uuid NOT NULL, "clinicId" uuid NOT NULL, "scheduledAt" TIMESTAMP WITH TIME ZONE NOT NULL, "frozenAmount" numeric(10,2) NOT NULL, "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL, "status" character varying NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_booking_holds_id" PRIMARY KEY ("id"), CONSTRAINT "FK_booking_holds_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE, CONSTRAINT "FK_booking_holds_doctor" FOREIGN KEY ("doctorId") REFERENCES "doctors"("id") ON DELETE CASCADE, CONSTRAINT "FK_booking_holds_clinic" FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE CASCADE)`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_booking_holds_doctor_slot_status" ON "booking_holds" ("doctorId", "scheduledAt", "status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_booking_holds_user_status" ON "booking_holds" ("userId", "status")`,
    );
    await queryRunner.query(
      `CREATE TABLE "payment_attempts" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid NOT NULL, "holdId" uuid NOT NULL, "paymentMethodId" uuid NOT NULL, "providerRef" character varying NOT NULL, "idempotencyKey" character varying NOT NULL, "amount" numeric(10,2) NOT NULL, "currency" character varying NOT NULL DEFAULT 'EGP', "status" character varying NOT NULL, "providerPaymentId" character varying, "appointmentId" uuid, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_payment_attempts_id" PRIMARY KEY ("id"), CONSTRAINT "FK_payment_attempts_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE, CONSTRAINT "FK_payment_attempts_hold" FOREIGN KEY ("holdId") REFERENCES "booking_holds"("id") ON DELETE RESTRICT, CONSTRAINT "FK_payment_attempts_method" FOREIGN KEY ("paymentMethodId") REFERENCES "payment_methods"("id") ON DELETE RESTRICT, CONSTRAINT "FK_payment_attempts_appointment" FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id") ON DELETE SET NULL)`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_payment_attempts_user_idempotency" ON "payment_attempts" ("userId", "idempotencyKey")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_payment_attempts_status_updated" ON "payment_attempts" ("status", "updatedAt")`,
    );
    await queryRunner.query(
      `CREATE TABLE "outbox_events" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "eventName" character varying NOT NULL, "payload" jsonb NOT NULL, "publishedAt" TIMESTAMP WITH TIME ZONE, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_outbox_events_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_outbox_events_pending" ON "outbox_events" ("publishedAt", "createdAt")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "outbox_events"`);
    await queryRunner.query(`DROP TABLE "payment_attempts"`);
    await queryRunner.query(`DROP TABLE "booking_holds"`);
  }
}
