import { Injectable } from '@nestjs/common';
import { AppointmentPrescriptionOrmEntity } from 'src/appointment/infrastructure/entities/typeorm/appointment-prescription.entity';
import { AppointmentOrmEntity } from 'src/appointment/infrastructure/entities/typeorm/appointment.entity';
import { BookingHoldOrmEntity } from 'src/appointment/infrastructure/entities/typeorm/booking-hold.entity';
import { TypeOrmAppointmentRepository } from 'src/appointment/infrastructure/repositories/typeorm-appointment.repository';
import { TypeOrmBookablePairingRepository } from 'src/appointment/infrastructure/repositories/typeorm-bookable-pairing.repository';
import { TypeOrmBookingHoldRepository } from 'src/appointment/infrastructure/repositories/typeorm-booking-hold.repository';
import { TypeOrmPrescriptionRepository } from 'src/appointment/infrastructure/repositories/typeorm-prescription.repository';
import { DoctorClinicOrmEntity } from 'src/doctor/infrastructure/entities/typeorm/doctor-clinic.entity';
import { advisoryXactLock } from 'src/infrastructure/database/advisory-lock';
import { appendOutboxEvent } from 'src/infrastructure/database/outbox';
import { PaymentAttemptOrmEntity } from 'src/payment-method/infrastructure/entities/typeorm/payment-attempt.entity';
import { PaymentSessionOrmEntity } from 'src/payment-method/infrastructure/entities/typeorm/payment-session.entity';
import { TypeOrmPaymentAttemptRepository } from 'src/payment-method/infrastructure/repositories/typeorm-payment-attempt.repository';
import { TypeOrmPaymentSessionRepository } from 'src/payment-method/infrastructure/repositories/typeorm-payment-session.repository';
import { DataSource } from 'typeorm';

import type {
  AppointmentTransactionRepositories,
  AppointmentUnitOfWork,
} from 'src/appointment/domain/repositories/unit-of-work';
import type { EntityManager } from 'typeorm';

/**
 * Builds the appointment bundle over one transactional manager.
 *
 * Exported because the payment module's transaction genuinely spans these
 * tables too — booking a paid hold writes the attempt, the hold and the
 * appointment together. The payment unit of work composes this rather than
 * restating it, so both modules provably share one manager.
 */
export function buildAppointmentRepositories(
  manager: EntityManager,
): AppointmentTransactionRepositories {
  return {
    appointments: new TypeOrmAppointmentRepository(
      manager.getRepository(AppointmentOrmEntity),
    ),
    holds: new TypeOrmBookingHoldRepository(
      manager.getRepository(BookingHoldOrmEntity),
    ),
    prescriptions: new TypeOrmPrescriptionRepository(
      manager.getRepository(AppointmentPrescriptionOrmEntity),
    ),
    pairings: new TypeOrmBookablePairingRepository(
      manager.getRepository(DoctorClinicOrmEntity),
    ),
    paymentAttempts: new TypeOrmPaymentAttemptRepository(
      manager.getRepository(PaymentAttemptOrmEntity),
    ),
    paymentSessions: new TypeOrmPaymentSessionRepository(
      manager.getRepository(PaymentSessionOrmEntity),
    ),
    // The key must stay `appointment-doctor:<id>` byte for byte - it *is* the
    // lock identity, shared with any older deployment still serving traffic
    // mid-rollout.
    lockDoctor: (doctorId: string) =>
      advisoryXactLock(manager, 'appointment-doctor', doctorId),
    appendEvent: (eventName, payload) =>
      appendOutboxEvent(manager, eventName, payload),
  };
}

/**
 * The only place the appointment module may call `DataSource.transaction`.
 *
 * Every repository in the bundle is built from the **same** `manager`, which
 * is what makes them one transaction. Injecting the singleton repositories
 * instead would bind each to the default connection and quietly give each its
 * own transaction — the exact failure this class prevents.
 */
@Injectable()
export class TypeOrmAppointmentUnitOfWork implements AppointmentUnitOfWork {
  constructor(private readonly dataSource: DataSource) {}

  execute<T>(
    work: (repositories: AppointmentTransactionRepositories) => Promise<T>,
  ): Promise<T> {
    return this.dataSource.transaction((manager) =>
      work(buildAppointmentRepositories(manager)),
    );
  }
}
