import { Test } from '@nestjs/testing';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { Gender } from './domain/enums/user.enum';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: { signup: jest.Mock };

  beforeEach(async () => {
    authService = { signup: jest.fn(), verifyEmail: jest.fn() };
    const module = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: authService }],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  it('signs up a user and returns a success message', async () => {
    const dto = {
      name: 'Test User',
      email: 'test@example.com',
      phone: '+1234567890',
      gender: Gender.FEMALE,
      password: 'Password123!',
    };

    await expect(controller.signup(dto)).resolves.toEqual({
      message: 'Signed up successfully!',
    });
    expect(authService.signup).toHaveBeenCalledWith(dto);
  });

  it('verifies an email and returns a success message', async () => {
    const dto = {
      email: 'test@example.com',
      otp: '123456',
    };

    await expect(controller.verifyEmail(dto)).resolves.toEqual({
      message: 'Email verified successfully!',
    });
    expect(authService.verifyEmail).toHaveBeenCalledWith(dto);
  });
});
