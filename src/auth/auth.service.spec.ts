/* eslint-disable @typescript-eslint/unbound-method */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unnecessary-type-assertion */

import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { MailService } from '../common/services/mail/mail.service';
import { OtpService } from '../common/services/otp/otp.service';
import { SecurityService } from '../common/services/security/security.service';
import { TokenService } from '../common/services/token/token.service';

import { AuthService } from './auth.service';
import { UserCredentials } from './auth.type';
import { Session } from './domain/entities/session.model';
import { User } from './domain/entities/user.model';
import { TokenType } from './domain/enums/token.enum';
import { Gender } from './domain/enums/user.enum';
import { SESSION_REPOSITORY } from './domain/repositories/session.repository';
import { USER_REPOSITORY } from './domain/repositories/user.repository';

describe('AuthService', () => {
  let securityService: SecurityService;
  let otpService: OtpService;
  let mailService: MailService;
  let tokenService: TokenService;

  let sessionRepo: {
    createSessionWithToken: jest.Mock;
    findSessionWithUser: jest.Mock;
    createToken: jest.Mock;
    findTokenByJti: jest.Mock;
    revokeToken: jest.Mock;
    revokeSession: jest.Mock;
    revokeAllUserSessions: jest.Mock;
  };

  let userRepo: {
    findById: jest.Mock;
    findByEmail: jest.Mock;
    save: jest.Mock;
  };

  let service: AuthService;

  const signed = (token: string) => ({
    token,
    jti: `${token}-jti`,
    expiresAt: new Date(Date.now() + 60_000),
  });

  beforeEach(async () => {
    const sessionRepoMock = {
      createSessionWithToken: jest.fn(),
      findSessionWithUser: jest.fn(),
      createToken: jest.fn(),
      findTokenByJti: jest.fn(),
      revokeToken: jest.fn(),
      revokeSession: jest.fn(),
      revokeAllUserSessions: jest.fn(),
    };

    const userRepoMock = {
      findById: jest.fn(),
      findByEmail: jest.fn(),
      save: jest.fn(),
    };

    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: SecurityService,
          useValue: {
            hash: jest.fn(),
            verify: jest.fn(),
          },
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
          useValue: {
            sendSignupVerification: jest.fn(),
          },
        },
        {
          provide: TokenService,
          useValue: {
            sign: jest.fn(),
            verify: jest.fn(),
          },
        },
        {
          provide: SESSION_REPOSITORY,
          useValue: sessionRepoMock,
        },
        {
          provide: USER_REPOSITORY,
          useValue: userRepoMock,
        },
      ],
    }).compile();

    securityService = module.get<SecurityService>(SecurityService);
    otpService = module.get<OtpService>(OtpService);
    mailService = module.get<MailService>(MailService);
    tokenService = module.get<TokenService>(TokenService);

    sessionRepo = sessionRepoMock;
    userRepo = userRepoMock;

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
      userRepo.findByEmail.mockResolvedValue({} as User);

      await expect(signup(fakeDto)).rejects.toThrow(BadRequestException);

      expect(userRepo.findByEmail).toHaveBeenCalledWith(fakeDto.email);
      expect(securityService.hash).not.toHaveBeenCalled();
      expect(userRepo.save).not.toHaveBeenCalled();
    });

    it('hashes the password and saves a new active but unverified user', async () => {
      const passwordHash = 'hashed-password';

      userRepo.findByEmail.mockResolvedValue(null);
      securityService.hash.mockResolvedValue(passwordHash);
      otpService.send.mockResolvedValue('123456');

      await expect(signup(fakeDto)).resolves.toBeUndefined();

      expect(securityService.hash).toHaveBeenCalledWith(fakeDto.password);

      expect(userRepo.save).toHaveBeenCalledWith(
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

      expect(otpService.send).toHaveBeenCalledWith(
        expect.any(String),
        'signup',
      );

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
      userRepo.findByEmail.mockResolvedValue(null);

      await expect(service.verifyEmail(fakeDto)).rejects.toThrow(
        BadRequestException,
      );

      expect(otpService.verify).not.toHaveBeenCalled();
      expect(userRepo.save).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when the email is already verified', async () => {
      userRepo.findByEmail.mockResolvedValue({
        isVerified: true,
      } as User);

      await expect(service.verifyEmail(fakeDto)).rejects.toThrow(
        BadRequestException,
      );

      expect(otpService.verify).not.toHaveBeenCalled();
      expect(userRepo.save).not.toHaveBeenCalled();
    });

    it('verifies and saves the user after a valid OTP', async () => {
      const user = {
        id: 'user-id',
        isVerified: false,
      } as User;

      userRepo.findByEmail.mockResolvedValue(user);

      await expect(service.verifyEmail(fakeDto)).resolves.toBeUndefined();

      expect(otpService.verify).toHaveBeenCalledWith(
        user.id,
        'signup',
        fakeDto.otp,
      );

      expect(otpService.consume).toHaveBeenCalledWith(user.id, 'signup');

      expect(user.isVerified).toBe(true);
      expect(userRepo.save).toHaveBeenCalledWith(user);
    });
  });

  describe('resendVerification', () => {
    const fakeDto = {
      email: 'test@expenseflow.com',
    };

    it('throws BadRequestException when the user does not exist', async () => {
      userRepo.findByEmail.mockResolvedValue(null);

      await expect(service.resendVerification(fakeDto)).rejects.toThrow(
        BadRequestException,
      );

      expect(otpService.send).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when the email is already verified', async () => {
      userRepo.findByEmail.mockResolvedValue({
        isVerified: true,
      } as User);

      await expect(service.resendVerification(fakeDto)).rejects.toThrow(
        BadRequestException,
      );

      expect(otpService.send).not.toHaveBeenCalled();
    });

    it('sends a new verification code through the shared delivery flow', async () => {
      const user = {
        id: 'user-id',
        email: fakeDto.email,
        isVerified: false,
      } as User;

      userRepo.findByEmail.mockResolvedValue(user);
      otpService.send.mockResolvedValue('654321');

      await expect(
        service.resendVerification(fakeDto),
      ).resolves.toBeUndefined();

      expect(otpService.send).toHaveBeenCalledWith(user.id, 'signup');

      expect(mailService.sendSignupVerification).toHaveBeenCalledWith(
        user.email,
        '654321',
      );

      expect(userRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('login', () => {
    const fakeDto = {
      email: 'test@expenseflow.com',
      password: 'wrongpassword',
    };

    const fakeFoundUser = {
      id: '123',
      email: 'test@expenseflow.com',
      isActive: true,
      isVerified: true,
      accessLevel: 'verified',
      getPasswordHash: () => 'correctpassword',
    } as unknown as User;

    it('throws BadRequestException when the user does not exist', async () => {
      userRepo.findByEmail.mockResolvedValue(null);
      securityService.verify.mockResolvedValue(false);

      await expect(service.login(fakeDto)).rejects.toThrow(BadRequestException);

      expect(userRepo.findByEmail).toHaveBeenCalledWith(fakeDto.email);
      expect(securityService.verify).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when the password is incorrect', async () => {
      userRepo.findByEmail.mockResolvedValue({
        email: 'test@expenseflow.com',
        getPasswordHash: () => 'correctpassword',
      } as unknown as User);

      securityService.verify.mockResolvedValue(false);

      await expect(service.login(fakeDto)).rejects.toThrow(BadRequestException);

      expect(securityService.verify).toHaveBeenCalledWith(
        'correctpassword',
        fakeDto.password,
      );
    });

    it('throws ForbiddenException when the user account is deactivated', async () => {
      userRepo.findByEmail.mockResolvedValue({
        email: 'test@expenseflow.com',
        getPasswordHash: () => 'correctpassword',
        isActive: false,
      } as unknown as User);

      securityService.verify.mockResolvedValue(true);

      await expect(service.login(fakeDto)).rejects.toThrow(ForbiddenException);
    });

    it('opens a session and persists only the refresh token', async () => {
      tokenService.sign
        .mockResolvedValueOnce(signed('refresh-token'))
        .mockResolvedValueOnce(signed('access-token'));

      userRepo.findByEmail.mockResolvedValue(fakeFoundUser);
      securityService.verify.mockResolvedValue(true);

      await expect(service.login(fakeDto, 'jest-agent')).resolves.toEqual({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      });

      expect(sessionRepo.createSessionWithToken).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: '123',
          deviceInfo: 'jest-agent',
        }),
        expect.objectContaining({
          userId: '123',
          type: TokenType.REFRESH,
          jti: 'refresh-token-jti',
        }),
      );

      expect(sessionRepo.createToken).not.toHaveBeenCalled();
    });

    it('signs both tokens with the same session id', async () => {
      tokenService.sign
        .mockResolvedValueOnce(signed('refresh-token'))
        .mockResolvedValueOnce(signed('access-token'));

      userRepo.findByEmail.mockResolvedValue(fakeFoundUser);
      securityService.verify.mockResolvedValue(true);

      await service.login(fakeDto);

      const [refreshPayload] = tokenService.sign.mock.calls[0] as [
        { sid: string },
      ];

      const [accessPayload] = tokenService.sign.mock.calls[1] as [
        { sid: string },
      ];

      expect(refreshPayload.sid).toBe(accessPayload.sid);
      expect(refreshPayload.sid).toEqual(expect.any(String));
    });
  });

  describe('refresh', () => {
    const sessionEndsAt = new Date(Date.now() + 60 * 60 * 1000);

    const credentials = {
      user: {
        email: 'test@expenseflow.com',
        accessLevel: 'verified',
      } as User,
      session: new Session(
        'session-1',
        '123',
        null,
        false,
        sessionEndsAt,
        new Date(),
        new Date(),
      ),
      decoded: {
        sub: '123',
        email: 'test@expenseflow.com',
        sid: 'session-1',
        jti: 'old-jti',
        iat: 0,
        exp: 0,
      },
    } as UserCredentials;

    it('revokes the presented token and issues a new pair in the same session', async () => {
      tokenService.sign
        .mockResolvedValueOnce(signed('new-refresh-token'))
        .mockResolvedValueOnce(signed('new-access-token'));

      await expect(service.refresh(credentials)).resolves.toEqual({
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
      });

      expect(sessionRepo.revokeToken).toHaveBeenCalledWith('old-jti');

      expect(sessionRepo.createToken).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: 'session-1',
        }),
      );

      expect(sessionRepo.createSessionWithToken).not.toHaveBeenCalled();
    });
  });

  describe('logout', () => {
    const credentials = {
      user: {} as User,
      decoded: {
        sub: '123',
        email: 'test@expenseflow.com',
        sid: 'session-1',
        jti: 'access-jti',
        iat: 0,
        exp: Math.floor(Date.now() / 1000) + 900,
      },
    } as UserCredentials;

    it('revokes the current session only', async () => {
      await service.logout(credentials);

      expect(sessionRepo.revokeSession).toHaveBeenCalledWith('session-1');
      expect(sessionRepo.revokeAllUserSessions).not.toHaveBeenCalled();
    });

    it('revokes every session when the everywhere flag is set', async () => {
      await service.logout(credentials, true);

      expect(sessionRepo.revokeAllUserSessions).toHaveBeenCalledWith('123');
      expect(sessionRepo.revokeSession).not.toHaveBeenCalled();
    });
  });
});
