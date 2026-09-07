import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { MailService } from '../common/services/mail/mail.service';
import { OtpService } from '../common/services/otp/otp.service';
import { SecurityService } from '../common/services/security/security.service';
import { TokenService } from '../common/services/token/token.service';

import { AuthService } from './auth.service';
import { Gender } from './domain/enums/user.enum';
import {
  USER_REPOSITORY,
  UserRepository,
} from './domain/repositories/user.repository';

describe('AuthService', () => {
  let securityService: SecurityService;
  let otpService: OtpService;
  let mailService: MailService;
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
        {
          provide: SecurityService,
          useValue: { hash: jest.fn(), verify: jest.fn() },
        },
        {
          provide: OtpService,
          useValue: {
            consume: jest.fn(),
            send: jest.fn(),
            verify: jest.fn(),
          },
        },
        {
          provide: MailService,
          useValue: { sendSignupVerification: jest.fn() },
        },
        { provide: TokenService, useValue: { sign: jest.fn() } },
        { provide: USER_REPOSITORY, useValue: mockRepository },
      ],
    }).compile();

    securityService = module.get<SecurityService>(SecurityService);
    otpService = module.get<OtpService>(OtpService);
    mailService = module.get<MailService>(MailService);
    tokenService = module.get<TokenService>(TokenService);
    userRepo = module.get(USER_REPOSITORY);
    service = module.get<AuthService>(AuthService);
  });

  describe('signup', () => {
    const fakeDto = {
      name: 'Test User',
      email: 'test@expenseflow.com',
      phone: '+1234567890',
      gender: Gender.FEMALE,
      password: 'password',
    };
    const signup = (dto: typeof fakeDto) => service.signup(dto);

    it('throws BadRequestException when the email is already in use', async () => {
      (userRepo.findByEmail as jest.Mock).mockResolvedValue({});

      await expect(signup(fakeDto)).rejects.toThrow(BadRequestException);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(userRepo.findByEmail as jest.Mock).toHaveBeenCalledWith(
        fakeDto.email,
      );
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(securityService.hash as jest.Mock).not.toHaveBeenCalled();
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(userRepo.save as jest.Mock).not.toHaveBeenCalled();
    });

    it('hashes the password and saves a new active but unverified user', async () => {
      const passwordHash = 'hashed-password';
      (userRepo.findByEmail as jest.Mock).mockResolvedValue(null);
      (securityService.hash as jest.Mock).mockResolvedValue(passwordHash);
      (otpService.send as jest.Mock).mockResolvedValue('123456');

      await expect(signup(fakeDto)).resolves.toBeUndefined();

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(securityService.hash as jest.Mock).toHaveBeenCalledWith(
        fakeDto.password,
      );
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(userRepo.save as jest.Mock).toHaveBeenCalledWith(
        expect.objectContaining({
          name: fakeDto.name,
          email: fakeDto.email,
          phone: fakeDto.phone,
          gender: fakeDto.gender,
          isActive: true,
          isVerified: false,
        }),
      );
      expect(userRepo.save.mock.calls[0][0].getPasswordHash()).toBe(
        passwordHash,
      );
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(otpService.send).toHaveBeenCalledWith(
        expect.any(String),
        'signup',
      );
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mailService.sendSignupVerification).toHaveBeenCalledWith(
        fakeDto.email,
        '123456',
      );
    });
  });

  describe('verifyEmail', () => {
    const fakeDto = {
      email: 'test@expenseflow.com',
      otp: '123456',
    };

    it('throws BadRequestException when the user does not exist', async () => {
      (userRepo.findByEmail as jest.Mock).mockResolvedValue(null);

      await expect(service.verifyEmail(fakeDto)).rejects.toThrow(
        BadRequestException,
      );
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(otpService.verify).not.toHaveBeenCalled();
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(userRepo.save).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when the email is already verified', async () => {
      (userRepo.findByEmail as jest.Mock).mockResolvedValue({
        isVerified: true,
      });

      await expect(service.verifyEmail(fakeDto)).rejects.toThrow(
        BadRequestException,
      );
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(otpService.verify).not.toHaveBeenCalled();
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(userRepo.save).not.toHaveBeenCalled();
    });

    it('verifies and saves the user after a valid OTP', async () => {
      const user = { id: 'user-id', isVerified: false };
      (userRepo.findByEmail as jest.Mock).mockResolvedValue(user);

      await expect(service.verifyEmail(fakeDto)).resolves.toBeUndefined();

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(otpService.verify).toHaveBeenCalledWith(
        user.id,
        'signup',
        fakeDto.otp,
      );
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(otpService.consume).toHaveBeenCalledWith(user.id, 'signup');
      expect(user.isVerified).toBe(true);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(userRepo.save).toHaveBeenCalledWith(user);
    });
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

      const { id, isActive, email } = fakeFoundUser;
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(tokenService.sign).toHaveBeenCalledWith(
        expect.objectContaining({ sub: id, email, isActive }),
      );
    });
  });
});
