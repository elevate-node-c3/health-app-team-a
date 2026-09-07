import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { SecurityService } from 'src/common/services/security/security.service';
import { TokenService } from 'src/common/services/token/token.service';

import { AuthService } from './auth.service';
import {
  USER_REPOSITORY,
  UserRepository,
} from './domain/repositories/user.repository';

describe('AuthService', () => {
  let securityService: SecurityService;
  let tokenService: TokenService;
  let userRepo: jest.Mocked<UserRepository>;
  let service: AuthService;

  beforeEach(async () => {
    const mockRepository = {
      findById: jest.fn(),
      findByEmail: jest.fn(),
      save: jest.fn(),
    };

    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: SecurityService, useValue: { verify: jest.fn() } },
        { provide: TokenService, useValue: { sign: jest.fn() } },
        { provide: USER_REPOSITORY, useValue: mockRepository },
      ],
    }).compile();

    securityService = module.get<SecurityService>(SecurityService);
    tokenService = module.get<TokenService>(TokenService);
    userRepo = module.get(USER_REPOSITORY);
    service = module.get<AuthService>(AuthService);
  });

  describe('login', () => {
    const fakeDto = {
      email: 'test@expenseflow.com',
      password: 'wrongpassword',
    };

    const fakeToken = '1234';

    const fakeFoundUser = {
      id: '123',
      email: 'test@expenseflow.com',
      isActive: true,
      getPasswordHash: () => 'correctpassword',
    };

    it('throws BadRequestException when the user does not exist', async () => {
      (userRepo.findByEmail as jest.Mock).mockResolvedValue(null);
      (securityService.verify as jest.Mock).mockResolvedValue(false);

      await expect(service.login(fakeDto)).rejects.toThrow(BadRequestException);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(userRepo.findByEmail as jest.Mock).toHaveBeenCalledWith(
        fakeDto.email,
      );
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(securityService.verify).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when the password is incorrect', async () => {
      (userRepo.findByEmail as jest.Mock).mockResolvedValue({
        email: 'test@expressflow.com',
        getPasswordHash: () => 'correctpassword',
      });
      (securityService.verify as jest.Mock).mockResolvedValue(false);

      await expect(service.login(fakeDto)).rejects.toThrow(BadRequestException);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(securityService.verify).toHaveBeenCalledWith(
        'correctpassword',
        fakeDto.password,
      );
    });

    it('throws ForbiddenException when the user account is deactivated', async () => {
      (userRepo.findByEmail as jest.Mock).mockResolvedValue({
        email: 'test@expressflow.com',
        getPasswordHash: () => 'correctpassword',
        isActive: false,
      });
      (securityService.verify as jest.Mock).mockResolvedValue(true);

      await expect(service.login(fakeDto)).rejects.toThrow(ForbiddenException);
    });

    it('returns a token for valid credentials', async () => {
      (tokenService.sign as jest.Mock).mockResolvedValue(fakeToken);
      (userRepo.findByEmail as jest.Mock).mockResolvedValue(fakeFoundUser);
      (securityService.verify as jest.Mock).mockResolvedValue(true);

      await expect(service.login(fakeDto)).resolves.toEqual(fakeToken);

      const { id, email } = fakeFoundUser;
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(tokenService.sign).toHaveBeenCalledWith(
        expect.objectContaining({ sub: id, email }),
      );
    });
  });
});
