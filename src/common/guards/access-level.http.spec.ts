import { jest } from '@jest/globals';
import {
  INestApplication,
  UnauthorizedException,
  ValidationPipe,
  type ExecutionContext,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AppointmentBookingService } from 'src/appointment/appointment-booking.service';
import { AppointmentHistoryService } from 'src/appointment/appointment-history.service';
import { AppointmentController } from 'src/appointment/appointment.controller';
import { AuthController } from 'src/auth/auth.controller';
import { AuthService } from 'src/auth/auth.service';
import { AccessLevel } from 'src/auth/domain/enums/access-level.enum';
import { AuthenticationGuard } from 'src/common/guards/authentication.guard';
import { FavouriteController } from 'src/favourite/favourite.controller';
import { FavouriteService } from 'src/favourite/favourite.service';
import { MedicalQuestionController } from 'src/medical-question/medical-question.controller';
import { MedicalQuestionService } from 'src/medical-question/medical-question.service';
import { PaymentChargeService } from 'src/payment-method/payment-charge.service';
import { PaymentMethodController } from 'src/payment-method/payment-method.controller';
import { PaymentMethodService } from 'src/payment-method/payment-method.service';
import { SlotHoldController } from 'src/slot-hold/slot-hold.controller';
import { SlotHoldService } from 'src/slot-hold/slot-hold.service';
import request from 'supertest';

import type { Request } from 'express';
import type { Server } from 'node:http';
import type { UserCredentials } from 'src/auth/auth.type';

const DOCTOR_ID = '11111111-1111-4111-8111-111111111111';
const CLINIC_ID = '22222222-2222-4222-8222-222222222222';

/** Picks the caller's mode for a request; absent means no session at all. */
const MODE_HEADER = 'x-test-access-level';

/**
 * The authorization rule, asserted against the real controllers and the real
 * `AuthorizationGuard` — so it holds for the decorators as actually applied,
 * not for a reconstruction of them.
 *
 * `AuthenticationGuard` is stood in for, because exercising it needs tokens,
 * sessions and a database. The stand-in reproduces the one behaviour that
 * matters to authorization: no session is a 401 before authorization is ever
 * consulted. Every 403 below is therefore the genuine article, and the 401s
 * only record that the two refusals stay distinguishable.
 */
describe('User-mode authorization across modules (HTTP)', () => {
  let app: INestApplication;
  const calls: string[] = [];

  /** Records that the handler was reached, so a refusal cannot look like a pass. */
  const reached = (name: string) =>
    jest.fn(() => {
      calls.push(name);
      return Promise.resolve({ ok: true });
    });

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [
        SlotHoldController,
        FavouriteController,
        AppointmentController,
        PaymentMethodController,
        MedicalQuestionController,
        AuthController,
      ],
      providers: [
        {
          provide: SlotHoldService,
          useValue: { hold: reached('slot-hold') },
        },
        {
          provide: FavouriteService,
          useValue: { add: reached('favourite'), remove: jest.fn() },
        },
        {
          provide: AppointmentBookingService,
          useValue: {
            createHold: reached('appointment'),
            createReplacementHold: jest.fn(),
          },
        },
        {
          provide: AppointmentHistoryService,
          useValue: {
            list: reached('appointment-list'),
            cancel: jest.fn(),
            prescriptionLink: jest.fn(),
            prescriptionFile: jest.fn(),
          },
        },
        {
          provide: PaymentMethodService,
          useValue: {
            list: reached('payment-method'),
            add: jest.fn(),
            edit: jest.fn(),
            remove: jest.fn(),
          },
        },
        // The controller takes the charge service too, for the two payment
        // routes. Both are stubbed so the module resolves; the mode rules this
        // file asserts are the same either way.
        {
          provide: PaymentChargeService,
          useValue: {
            confirmPayment: jest.fn(),
            getPaymentStatus: jest.fn(),
          },
        },
        {
          provide: MedicalQuestionService,
          useValue: { ask: reached('medical-question') },
        },
        { provide: AuthService, useValue: { logout: jest.fn() } },
      ],
    })
      .overrideGuard(AuthenticationGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          const req = context.switchToHttp().getRequest<Request>();
          const mode = req.headers[MODE_HEADER] as AccessLevel | undefined;

          // No session: refused before authorization runs, as the real guard
          // does for everything except @OptionalAuth().
          if (!mode || mode === AccessLevel.GUEST)
            throw new UnauthorizedException();

          req.credentials = {
            user: {
              id: 'user-1',
              name: 'Mona',
              isVerified: mode === AccessLevel.VERIFIED,
            },
          } as UserCredentials;
          return true;
        },
      })
      .compile();

    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    calls.length = 0;
  });

  const server = (): Server => app.getHttpServer() as Server;

  /** One representative route per verified-only module. */
  const VERIFIED_ROUTES: [string, () => request.Test][] = [
    [
      'POST /slot-holds',
      () =>
        request(server()).post('/slot-holds').send({
          doctorId: DOCTOR_ID,
          clinicId: CLINIC_ID,
          scheduledAt: '2026-10-04T07:00:00Z',
        }),
    ],
    [
      'POST /favourites/:doctorId',
      () => request(server()).post(`/favourites/${DOCTOR_ID}`),
    ],
    [
      'POST /appointments/holds',
      () =>
        request(server()).post('/appointments/holds').send({
          doctorId: DOCTOR_ID,
          clinicId: CLINIC_ID,
          scheduledAt: '2026-10-04T07:00:00Z',
        }),
    ],
    ['GET /appointments', () => request(server()).get('/appointments')],
    ['GET /payment-methods', () => request(server()).get('/payment-methods')],
    [
      'POST /medical-questions',
      () =>
        request(server()).post('/medical-questions').send({
          concern: 'Persistent headache',
          symptoms: 'Mild headache for two days, no fever',
          gender: 'FEMALE',
          age: 29,
          isEmergency: false,
        }),
    ],
  ];

  describe('a verified user may act', () => {
    it.each(VERIFIED_ROUTES)('%s reaches the service', async (_name, call) => {
      const response = await call().set(MODE_HEADER, AccessLevel.VERIFIED);

      expect(response.status).toBeLessThan(400);
      expect(calls).toHaveLength(1);
    });
  });

  describe('an unverified user may not act', () => {
    // The acceptance criterion: anything a guest cannot do, an unverified user
    // cannot do either. Both halves are asserted - the 403, and the service
    // never being called, which is what proves the guard refused rather than
    // the handler failing on its own.
    it.each(VERIFIED_ROUTES)('%s is refused 403', async (_name, call) => {
      const response = await call().set(MODE_HEADER, AccessLevel.UNVERIFIED);

      expect(response.status).toBe(403);
      expect(response.body).toMatchObject({
        message: 'Please verify your account to perform this action',
      });
      expect(calls).toHaveLength(0);
    });
  });

  describe('a guest may not act', () => {
    it.each(VERIFIED_ROUTES)('%s is refused 401', async (_name, call) => {
      const response = await call();

      expect(response.status).toBe(401);
      expect(calls).toHaveLength(0);
    });
  });

  describe('account self-service stays open to an unverified user', () => {
    // Without this an unverified user could never see or verify their own
    // account, and the mode would be a dead end. It is the one deliberate
    // exception to the rule above.
    it('GET /auth/me returns the user when unverified', async () => {
      const response = await request(server())
        .get('/auth/me')
        .set(MODE_HEADER, AccessLevel.UNVERIFIED)
        .expect(200);

      expect(response.body).toMatchObject({
        user: { id: 'user-1', isVerified: false },
      });
    });

    it('GET /auth/me still refuses a guest', async () => {
      await request(server()).get('/auth/me').expect(401);
    });
  });
});
