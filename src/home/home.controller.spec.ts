import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { type Request } from 'express';
import { AuthenticationGuard } from 'src/common/guards/authentication.guard';

import { HomeController } from './home.controller';
import { HomeService } from './home.service';

describe('HomeController', () => {
  let controller: HomeController;
  let homeService: { getHome: jest.Mock };

  beforeEach(async () => {
    homeService = {
      getHome: jest
        .fn<() => Promise<unknown>>()
        .mockResolvedValue({ greeting: { text: 'Good morning' } }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HomeController],
      providers: [{ provide: HomeService, useValue: homeService }],
    })
      .overrideGuard(AuthenticationGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<HomeController>(HomeController);
  });

  it('returns the assembled home payload for a guest', async () => {
    const req = { credentials: undefined } as unknown as Request;

    const result = await controller.getHome(req);

    expect(result).toEqual({ greeting: { text: 'Good morning' } });
    expect(homeService.getHome).toHaveBeenCalledWith(null);
  });

  it('passes the signed-in user through', async () => {
    const user = { id: 'user-1', name: 'Nour' };
    const req = { credentials: { user } } as unknown as Request;

    await controller.getHome(req);

    expect(homeService.getHome).toHaveBeenCalledWith(user);
  });
});
