import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { type Request } from 'express';
import { AuthenticationGuard } from 'src/common/guards/authentication.guard';

import { DoctorController } from './doctor.controller';
import { DoctorService } from './doctor.service';

describe('DoctorController', () => {
  let controller: DoctorController;
  let doctorService: { getProfile: jest.Mock; getAvailability: jest.Mock };

  beforeEach(async () => {
    doctorService = {
      getProfile: jest
        .fn<() => Promise<unknown>>()
        .mockResolvedValue({ id: 'doc-1' }),
      getAvailability: jest
        .fn<() => Promise<unknown>>()
        .mockResolvedValue({ data: [], meta: {} }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DoctorController],
      providers: [{ provide: DoctorService, useValue: doctorService }],
    })
      .overrideGuard(AuthenticationGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<DoctorController>(DoctorController);
  });

  it('serves the profile to a guest', async () => {
    const req = { credentials: undefined } as unknown as Request;

    const result = await controller.profile('doc-1', req);

    expect(result).toEqual({ id: 'doc-1' });
    expect(doctorService.getProfile).toHaveBeenCalledWith('doc-1', null);
  });

  it('passes the signed-in user through so isFavourite can be resolved', async () => {
    const user = { id: 'user-1', name: 'Nour' };
    const req = { credentials: { user } } as unknown as Request;

    await controller.profile('doc-1', req);

    expect(doctorService.getProfile).toHaveBeenCalledWith('doc-1', user);
  });

  it('forwards the clinic and month to the availability use case', async () => {
    await controller.availability('doc-1', {
      clinicId: 'clinic-1',
      month: '2026-10',
    });

    expect(doctorService.getAvailability).toHaveBeenCalledWith('doc-1', {
      clinicId: 'clinic-1',
      month: '2026-10',
    });
  });
});
