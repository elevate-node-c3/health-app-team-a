import { Test, TestingModule } from '@nestjs/testing';
import { AuthenticationGuard } from 'src/common/guards/authentication.guard';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { Gender } from './domain/enums/user.enum';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: {
    resendVerification: jest.Mock;
    signup: jest.Mock;
    verifyEmail: jest.Mock;
    login: jest.Mock;
    refresh: jest.Mock;
    logout: jest.Mock;
  };
  const request = { get: jest.fn().mockReturnValue('jest-agent') };
  const response = { cookie: jest.fn() };

  beforeEach(async () => {
    authService = {
      resendVerification: jest.fn(),
      signup: jest.fn(),
      verifyEmail: jest.fn(),
      login: jest.fn(),
      refresh: jest.fn(),
      logout: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: authService }],
    })
      .overrideGuard(AuthenticationGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AuthController>(AuthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('signs up a user and returns a success message', async () => {
    const dto = {
      name: 'Test User',
      email: 'test@example.com',
      phone: '+201001234567',
      gender: Gender.FEMALE,
      password: 'Password123!',
      confirmPassword: 'Password123!',
    };

    await expect(controller.signup(dto)).resolves.toEqual({
      message: 'Signed up successfully!',
      destination: 't***@example.com',
    });
    expect(authService.signup).toHaveBeenCalledWith(dto);
  });

  it('verifies an email and returns a success message', async () => {
    const dto = {
      email: 'test@example.com',
      otp: '123456',
    };

    authService.verifyEmail.mockResolvedValue({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    });

    await expect(
      controller.verifyEmail(dto, request as never, response as never),
    ).resolves.toEqual({
      message: 'Email verified successfully!',
    });
    expect(authService.verifyEmail).toHaveBeenCalledWith(dto, 'jest-agent');
  });

  it('resends an email verification code', async () => {
    const dto = { email: 'test@example.com' };

    await expect(controller.resendVerification(dto)).resolves.toEqual({
      message: 'Verification code sent successfully!',
      destination: 't***@example.com',
    });
    expect(authService.resendVerification).toHaveBeenCalledWith(dto);
  });
});
