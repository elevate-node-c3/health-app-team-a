import { jest } from '@jest/globals';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AuthenticationGuard } from 'src/common/guards/authentication.guard';
import request from 'supertest';

import { DoctorController } from './doctor.controller';
import { DoctorService } from './doctor.service';

import type { Server } from 'node:http';

const DOCTOR_ID = '11111111-1111-4111-8111-111111111111';
const CLINIC_ID = '22222222-2222-4222-8222-222222222222';

/**
 * Exercises the real HTTP surface - route matching and the global
 * ValidationPipe from main.ts - with the service layer stubbed, so it needs no
 * database.
 */
describe('Doctor routes (HTTP)', () => {
  let app: INestApplication;
  let doctorService: { getProfile: jest.Mock; getAvailability: jest.Mock };

  beforeAll(async () => {
    doctorService = {
      getProfile: jest
        .fn<() => Promise<unknown>>()
        .mockResolvedValue({ id: DOCTOR_ID, name: 'Dr Mona' }),
      getAvailability: jest.fn<() => Promise<unknown>>().mockResolvedValue({
        data: [],
        meta: { isReservation: false },
      }),
    };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DoctorController],
      providers: [{ provide: DoctorService, useValue: doctorService }],
    })
      .overrideGuard(AuthenticationGuard)
      .useValue({ canActivate: () => true })
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

  /** getHttpServer() is untyped; narrow it once rather than at every call. */
  const server = (): Server => app.getHttpServer() as Server;

  it('serves the profile for a real uuid', async () => {
    const response = await request(server())
      .get(`/doctors/${DOCTOR_ID}`)
      .expect(200);

    expect(response.body).toEqual({ id: DOCTOR_ID, name: 'Dr Mona' });
  });

  it('rejects a non-uuid doctor id', async () => {
    await request(server()).get('/doctors/not-a-uuid').expect(400);
  });

  it('returns availability for a valid clinic and month', async () => {
    const response = await request(server())
      .get(`/doctors/${DOCTOR_ID}/availability`)
      .query({ clinicId: CLINIC_ID, month: '2026-10' })
      .expect(200);

    const body = response.body as { meta: { isReservation: boolean } };
    expect(body.meta.isReservation).toBe(false);
    expect(doctorService.getAvailability).toHaveBeenCalledWith(DOCTOR_ID, {
      clinicId: CLINIC_ID,
      month: '2026-10',
    });
  });

  it('requires clinicId, because hours and fee belong to the pairing', async () => {
    await request(server())
      .get(`/doctors/${DOCTOR_ID}/availability`)
      .expect(400);
  });

  it('rejects a malformed month', async () => {
    await request(server())
      .get(`/doctors/${DOCTOR_ID}/availability`)
      .query({ clinicId: CLINIC_ID, month: 'October' })
      .expect(400);

    await request(server())
      .get(`/doctors/${DOCTOR_ID}/availability`)
      .query({ clinicId: CLINIC_ID, month: '2026-13' })
      .expect(400);
  });

  it('strips unknown query params rather than passing them through', async () => {
    doctorService.getAvailability.mockClear();

    await request(server())
      .get(`/doctors/${DOCTOR_ID}/availability`)
      .query({ clinicId: CLINIC_ID, sneaky: 'value' })
      .expect(200);

    expect(doctorService.getAvailability).toHaveBeenCalledWith(DOCTOR_ID, {
      clinicId: CLINIC_ID,
    });
  });
});
