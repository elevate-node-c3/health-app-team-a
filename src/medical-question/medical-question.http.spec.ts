import { jest } from '@jest/globals';
import {
  type ExecutionContext,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AuthenticationGuard } from 'src/common/guards/authentication.guard';
import request from 'supertest';

import { MedicalQuestionController } from './medical-question.controller';
import { MedicalQuestionService } from './medical-question.service';

import type { Request } from 'express';
import type { Server } from 'node:http';
import type { UserCredentials } from 'src/auth/auth.type';

const QUESTION_ID = '33333333-3333-4333-8333-333333333333';

/** The authenticated caller the guard stand-in injects. */
const CALLER = { id: 'user-1', isVerified: true };

const VALID_BODY = {
  concern: 'Persistent headache',
  symptoms: 'Mild headache for two days, no fever',
  gender: 'FEMALE',
  age: 29,
  isEmergency: false,
};

/**
 * Exercises the real HTTP surface - route matching, `ParseUUIDPipe`, and the
 * global `ValidationPipe` from main.ts - with the service layer stubbed, so
 * it needs no database. The mode (guest/unverified/verified) matrix itself is
 * covered centrally in `src/common/guards/access-level.http.spec.ts`.
 */
describe('Medical question routes (HTTP)', () => {
  let app: INestApplication;
  let medicalQuestionService: {
    ask: jest.Mock;
    list: jest.Mock;
    get: jest.Mock;
    delete: jest.Mock;
  };

  beforeAll(async () => {
    medicalQuestionService = {
      ask: jest
        .fn<() => Promise<unknown>>()
        .mockResolvedValue({ id: QUESTION_ID }),
      list: jest.fn<() => Promise<unknown>>().mockResolvedValue({
        data: [],
        meta: { total: 0, page: 1, limit: 10, totalPages: 0 },
      }),
      get: jest
        .fn<() => Promise<unknown>>()
        .mockResolvedValue({ id: QUESTION_ID }),
      delete: jest
        .fn<() => Promise<unknown>>()
        .mockResolvedValue({ deleted: true }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [MedicalQuestionController],
      providers: [
        { provide: MedicalQuestionService, useValue: medicalQuestionService },
      ],
    })
      .overrideGuard(AuthenticationGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          const req = context.switchToHttp().getRequest<Request>();
          req.credentials = { user: CALLER } as UserCredentials;
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
    medicalQuestionService.ask.mockClear();
    medicalQuestionService.list.mockClear();
    medicalQuestionService.get.mockClear();
    medicalQuestionService.delete.mockClear();
  });

  const server = (): Server => app.getHttpServer() as Server;

  describe('POST /medical-questions', () => {
    it('accepts a valid question', async () => {
      await request(server())
        .post('/medical-questions')
        .send(VALID_BODY)
        .expect(201);

      expect(medicalQuestionService.ask).toHaveBeenCalledWith(
        CALLER.id,
        expect.objectContaining(VALID_BODY),
      );
    });

    it('rejects a concern over 50 characters', async () => {
      await request(server())
        .post('/medical-questions')
        .send({ ...VALID_BODY, concern: 'a'.repeat(51) })
        .expect(400);

      expect(medicalQuestionService.ask).not.toHaveBeenCalled();
    });

    it('rejects symptoms over 250 characters', async () => {
      await request(server())
        .post('/medical-questions')
        .send({ ...VALID_BODY, symptoms: 'a'.repeat(251) })
        .expect(400);

      expect(medicalQuestionService.ask).not.toHaveBeenCalled();
    });

    it('rejects a missing gender', async () => {
      const body: Record<string, unknown> = { ...VALID_BODY };
      delete body.gender;
      await request(server()).post('/medical-questions').send(body).expect(400);

      expect(medicalQuestionService.ask).not.toHaveBeenCalled();
    });

    it('rejects an invalid gender', async () => {
      await request(server())
        .post('/medical-questions')
        .send({ ...VALID_BODY, gender: 'ALIEN' })
        .expect(400);

      expect(medicalQuestionService.ask).not.toHaveBeenCalled();
    });

    it.each([
      ['negative', -1],
      ['implausibly old', 200],
      ['non-integer', 29.5],
    ])('rejects an implausible age (%s)', async (_label, age) => {
      await request(server())
        .post('/medical-questions')
        .send({ ...VALID_BODY, age })
        .expect(400);

      expect(medicalQuestionService.ask).not.toHaveBeenCalled();
    });

    it('rejects a missing isEmergency flag', async () => {
      const body: Record<string, unknown> = { ...VALID_BODY };
      delete body.isEmergency;
      await request(server()).post('/medical-questions').send(body).expect(400);

      expect(medicalQuestionService.ask).not.toHaveBeenCalled();
    });

    it('strips unknown body fields rather than passing them through', async () => {
      await request(server())
        .post('/medical-questions')
        .send({ ...VALID_BODY, doctorNote: 'should not pass' })
        .expect(201);

      expect(medicalQuestionService.ask).toHaveBeenCalledWith(
        CALLER.id,
        expect.objectContaining(VALID_BODY),
      );
    });
  });

  describe('GET /medical-questions', () => {
    it('passes page and limit through to the service', async () => {
      await request(server())
        .get('/medical-questions')
        .query({ page: 2, limit: 5 })
        .expect(200);

      expect(medicalQuestionService.list).toHaveBeenCalledWith(CALLER.id, 2, 5);
    });
  });

  describe('GET /medical-questions/:id', () => {
    it('rejects a non-uuid id', async () => {
      await request(server()).get('/medical-questions/not-a-uuid').expect(400);

      expect(medicalQuestionService.get).not.toHaveBeenCalled();
    });

    it('reaches the service for a valid id', async () => {
      await request(server())
        .get(`/medical-questions/${QUESTION_ID}`)
        .expect(200);

      expect(medicalQuestionService.get).toHaveBeenCalledWith(
        CALLER.id,
        QUESTION_ID,
      );
    });
  });

  describe('DELETE /medical-questions/:id', () => {
    it('rejects a non-uuid id', async () => {
      await request(server())
        .delete('/medical-questions/not-a-uuid')
        .expect(400);

      expect(medicalQuestionService.delete).not.toHaveBeenCalled();
    });

    it('reaches the service for a valid id', async () => {
      await request(server())
        .delete(`/medical-questions/${QUESTION_ID}`)
        .expect(200);

      expect(medicalQuestionService.delete).toHaveBeenCalledWith(
        CALLER.id,
        QUESTION_ID,
      );
    });
  });
});
