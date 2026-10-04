import { jest } from '@jest/globals';
import {
  type ExecutionContext,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AuthenticationGuard } from 'src/common/guards/authentication.guard';
import request from 'supertest';

import { SlotHoldController } from './slot-hold.controller';
import { SlotHoldService } from './slot-hold.service';

import type { Request } from 'express';
import type { Server } from 'node:http';
import type { UserCredentials } from 'src/auth/auth.type';

const DOCTOR_ID = '11111111-1111-4111-8111-111111111111';
const CLINIC_ID = '22222222-2222-4222-8222-222222222222';
const HOLD_ID = '33333333-3333-4333-8333-333333333333';

/** The authenticated caller the guard stand-in injects. */
const CALLER = { id: 'user-1', isVerified: true };

/**
 * Exercises the real HTTP surface - route matching and the global
 * ValidationPipe from main.ts - with the service layer stubbed, so it needs no
 * database.
 *
 * The point of interest is `scheduledAt`: the DTO guards only that it is an
 * unambiguous UTC instant, and whether that instant sits on the doctor's slot
 * grid is left to `findOfferedSlot`. So anything the calendar could have
 * generated must reach the service, whatever the clinic's slot length or zone
 * offset makes of it.
 */
describe('Slot hold routes (HTTP)', () => {
  let app: INestApplication;
  let slotHoldService: { hold: jest.Mock };

  beforeAll(async () => {
    slotHoldService = {
      hold: jest.fn<() => Promise<unknown>>().mockResolvedValue({
        created: true,
        hold: { id: HOLD_ID },
      }),
    };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SlotHoldController],
      providers: [{ provide: SlotHoldService, useValue: slotHoldService }],
    })
      .overrideGuard(AuthenticationGuard)
      .useValue({
        // The controller reads `req.credentials.user`, so letting the request
        // through is not enough - it has to arrive authenticated. `isVerified`
        // is required too: the real `AuthorizationGuard` still runs here, and
        // `@Verified()` would refuse this caller 403 without it. The mode rules
        // themselves are covered in common/guards/access-level.http.spec.ts;
        // this file is about `scheduledAt`.
        canActivate: (context: ExecutionContext) => {
          const req = context.switchToHttp().getRequest<Request>();
          req.credentials = { user: CALLER } as UserCredentials;
          return true;
        },
      })
      .compile();

    app = module.createNestApplication();
    // Same pipe configuration as src/main.ts.
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    slotHoldService.hold.mockClear();
  });

  /** getHttpServer() is untyped; narrow it once rather than at every call. */
  const server = (): Server => app.getHttpServer() as Server;

  const post = (scheduledAt: string) =>
    request(server())
      .post('/slot-holds')
      .send({ doctorId: DOCTOR_ID, clinicId: CLINIC_ID, scheduledAt });

  describe('accepts any UTC instant and lets the schedule judge it', () => {
    it.each([
      ['on the half hour', '2026-10-04T07:00:00Z'],
      // A 20-minute schedule row generates local :20 and :40 times; the old
      // regex rejected them before the service could price them.
      ['on a 20-minute grid', '2026-10-04T07:20:00Z'],
      // Asia/Kathmandu is +05:45, so a local 09:00 slot is this instant - the
      // grid is not a property of UTC minutes at all.
      ['in a 45-minute-offset zone', '2026-10-04T03:15:00Z'],
      ['with milliseconds', '2026-10-04T07:20:00.000Z'],
    ])('%s', async (_label, scheduledAt) => {
      await post(scheduledAt).expect(201);

      expect(slotHoldService.hold).toHaveBeenCalledWith(CALLER, {
        doctorId: DOCTOR_ID,
        clinicId: CLINIC_ID,
        scheduledAt,
      });
    });
  });

  describe('rejects a scheduledAt that is not an unambiguous UTC instant', () => {
    it.each([
      // Would be read against the server's own zone, so the instant held would
      // depend on where the process runs.
      ['no offset', '2026-10-04T09:00:00'],
      ['an explicit offset', '2026-10-04T09:00:00+02:00'],
      ['date only', '2026-10-04'],
      ['not a date', 'tomorrow morning'],
    ])('%s', async (_label, scheduledAt) => {
      await post(scheduledAt).expect(400);

      expect(slotHoldService.hold).not.toHaveBeenCalled();
    });
  });

  it('requires the doctor and clinic ids to be uuids', async () => {
    await request(server())
      .post('/slot-holds')
      .send({
        doctorId: 'not-a-uuid',
        clinicId: CLINIC_ID,
        scheduledAt: '2026-10-04T07:00:00Z',
      })
      .expect(400);

    expect(slotHoldService.hold).not.toHaveBeenCalled();
  });

  it('strips unknown body fields rather than passing them through', async () => {
    await request(server())
      .post('/slot-holds')
      .send({
        doctorId: DOCTOR_ID,
        clinicId: CLINIC_ID,
        scheduledAt: '2026-10-04T07:00:00Z',
        feeAmount: 0,
      })
      .expect(201);

    expect(slotHoldService.hold).toHaveBeenCalledWith(CALLER, {
      doctorId: DOCTOR_ID,
      clinicId: CLINIC_ID,
      scheduledAt: '2026-10-04T07:00:00Z',
    });
  });
});
