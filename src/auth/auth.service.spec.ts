import { jest } from '@jest/globals';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import { MailService } from 'src/common/services/mail/mail.service';
import { OtpService } from 'src/common/services/otp/otp.service';
import { SecurityService } from 'src/common/services/security/security.service';
import { IDecodedJwtPayload } from 'src/common/services/token/jwt.type';
import { TokenService } from 'src/common/services/token/token.service';
import { RedisService } from 'src/infrastructure/cache/redis.service';

import { AuthService } from './auth.service';
import { UserCredentials } from './auth.type';
import { Session } from './domain/entities/session.model';
import { User } from './domain/entities/user.model';
import { AccessLevel } from './domain/enums/access-level.enum';
import { TokenType } from './domain/enums/token.enum';
import { Gender } from './domain/enums/user.enum';
import {
  SESSION_REPOSITORY,
  type SessionRepository,
} from './domain/repositories/session.repository';
import {
  USER_REPOSITORY,
  type UserRepository,
} from './domain/repositories/user.repository';

type UserOverrides = {
  id: string;
  name: string;
  email: string;
  phone: string;
  gender: Gender;
  isActive: boolean;
  isVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
  password: string;
};

const buildUser = (overrides: Partial<UserOverrides> = {}): User => {
  const u: UserOverrides = {
    id: 'user-1',
    name: 'Test User',
    email: 'test@example.com',
    phone: '01001234567',
    gender: Gender.FEMALE,
    isActive: true,
    isVerified: false,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    password: 'hashed-password',
    ...overrides,
  };

  return new User(
    u.id,
    u.name,
    u.email,
    u.phone,
    u.gender,
    u.isActive,
    u.isVerified,
    u.createdAt,
    u.updatedAt,
    u.password,
  );
};

const buildSession = (overrides: Partial<Session> = {}): Session =>
  new Session(
    overrides.id ?? 'session-1',
    overrides.userId ?? 'user-1',
    overrides.deviceInfo ?? 'jest-agent',
    overrides.revoked ?? false,
    overrides.expiresAt ?? new Date(Date.now() + 60 * 60 * 1000),
    overrides.createdAt ?? new Date('2026-01-01T00:00:00Z'),
    overrides.updatedAt ?? new Date('2026-01-01T00:00:00Z'),
  );

const buildCredentials = (
  overrides: Partial<IDecodedJwtPayload> = {},
): UserCredentials => {
  const user = buildUser({ isVerified: true });
  const session = buildSession();
  const decoded: IDecodedJwtPayload = {
    sub: user.id,
    email: user.email,
    sid: session.id,
    level: AccessLevel.VERIFIED,
    iat: 1000,
    exp: 2000,
    jti: 'refresh-jti-old',
    ...overrides,
  };

  return { user, session, decoded };
};

describe('AuthService', () => {
  let service: AuthService;
  let userRepo: Record<keyof UserRepository, jest.Mock>;
  let sessionRepo: Record<keyof SessionRepository, jest.Mock>;
  let securityService: { hash: jest.Mock; verify: jest.Mock };
  let otpService: { send: jest.Mock; verify: jest.Mock; consume: jest.Mock };
  let mailService: { sendOtp: jest.Mock };
  let tokenService: { sign: jest.Mock; verify: jest.Mock };
  let eventEmitter: { emit: jest.Mock };

  beforeEach(async () => {
    userRepo = {
      findById: jest.fn(),
      findByEmail: jest.fn(),
      findByPhone: jest.fn(),
      findByEmailOrPhone: jest.fn(),
      findAll: jest.fn(),
      save: jest.fn().mockResolvedValue(undefined),
    };

    sessionRepo = {
      createSessionWithToken: jest.fn().mockResolvedValue(undefined),
      findSessionWithUser: jest.fn(),
      createToken: jest.fn().mockResolvedValue(undefined),
      findTokenByJti: jest.fn(),
      revokeToken: jest.fn().mockResolvedValue(undefined),
      revokeSession: jest.fn().mockResolvedValue(undefined),
      revokeAllUserSessions: jest.fn().mockResolvedValue(undefined),
    };

    securityService = {
      hash: jest.fn().mockResolvedValue('hashed-password'),
      verify: jest.fn().mockResolvedValue(true),
    };

    otpService = {
      send: jest.fn().mockResolvedValue('1234'),
      verify: jest.fn().mockResolvedValue(true),
      consume: jest.fn().mockResolvedValue(true),
    };

    mailService = { sendOtp: jest.fn().mockResolvedValue(undefined) };

    tokenService = {
      sign: jest.fn((_payload: unknown, type: TokenType) =>
        Promise.resolve(
          type === TokenType.REFRESH
            ? {
                token: 'refresh-token',
                jti: 'refresh-jti',
                expiresAt: new Date('2026-12-01T00:00:00Z'),
              }
            : {
                token: 'access-token',
                jti: 'access-jti',
                expiresAt: new Date('2026-09-18T00:00:00Z'),
              },
        ),
      ),
      verify: jest.fn(),
    };

    eventEmitter = { emit: jest.fn() };

    jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: USER_REPOSITORY, useValue: userRepo },
        { provide: SESSION_REPOSITORY, useValue: sessionRepo },
        { provide: SecurityService, useValue: securityService },
        { provide: OtpService, useValue: otpService },
        { provide: MailService, useValue: mailService },
        { provide: TokenService, useValue: tokenService },
        { provide: RedisService, useValue: {} },
        { provide: EventEmitter2, useValue: eventEmitter },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('signup', () => {
    const dto = {
      name: 'New User',
      email: 'new@example.com',
      phone: '01000000000',
      gender: Gender.MALE,
      password: 'Password123!',
      confirmPassword: 'Password123!',
    };

    it('registers a brand new user and issues a verification code', async () => {
      userRepo.findByEmailOrPhone.mockResolvedValue([]);

      await service.signup(dto);

      expect(securityService.hash).toHaveBeenCalledWith(dto.password);

      const savedUser = userRepo.save.mock.calls[0][0] as User;
      expect(savedUser).toBeInstanceOf(User);
      expect(savedUser.email).toBe(dto.email);
      expect(savedUser.phone).toBe(dto.phone);
      expect(savedUser.isActive).toBe(true);
      expect(savedUser.isVerified).toBe(false);
      expect(savedUser.getPasswordHash()).toBe('hashed-password');

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'user.registered',
        expect.objectContaining({ email: dto.email, phone: dto.phone }),
      );
      expect(otpService.send).toHaveBeenCalledWith(
        savedUser.id,
        'email-verification',
      );
      expect(mailService.sendOtp).toHaveBeenCalledWith(dto.email, '1234');
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'user.verification_code.issued',
        expect.objectContaining({ email: dto.email }),
      );
    });

    it('resends a verification code for a single existing unverified user without creating a new one', async () => {
      const existing = buildUser({
        id: 'existing-1',
        email: dto.email,
        isVerified: false,
      });
      userRepo.findByEmailOrPhone.mockResolvedValue([existing]);

      await service.signup(dto);

      expect(userRepo.save).not.toHaveBeenCalled();
      expect(securityService.hash).not.toHaveBeenCalled();
      expect(otpService.send).toHaveBeenCalledWith(
        'existing-1',
        'email-verification',
      );
      expect(mailService.sendOtp).toHaveBeenCalledWith(dto.email, '1234');
    });

    it('rejects when the email already belongs to a verified user', async () => {
      const existing = buildUser({
        email: dto.email,
        phone: 'other-phone',
        isVerified: true,
      });
      userRepo.findByEmailOrPhone.mockResolvedValue([existing]);

      const error = await service
        .signup(dto)
        .then(() => null)
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toMatchObject({
        message: expect.arrayContaining([
          'This email is already registered',
        ]) as unknown[],
      });
      expect(userRepo.save).not.toHaveBeenCalled();
    });

    it('rejects when the phone already belongs to a verified user', async () => {
      const existing = buildUser({
        email: 'other@example.com',
        phone: dto.phone,
        isVerified: true,
      });
      userRepo.findByEmailOrPhone.mockResolvedValue([existing]);

      const error = await service
        .signup(dto)
        .then(() => null)
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toMatchObject({
        message: expect.arrayContaining([
          'This phone number is already registered',
        ]) as unknown[],
      });
    });

    it('reports both email and phone conflicts across verified users', async () => {
      const emailOwner = buildUser({
        id: 'a',
        email: dto.email,
        phone: 'other-phone',
        isVerified: true,
      });
      const phoneOwner = buildUser({
        id: 'b',
        email: 'other@example.com',
        phone: dto.phone,
        isVerified: true,
      });
      userRepo.findByEmailOrPhone.mockResolvedValue([emailOwner, phoneOwner]);

      const error = await service
        .signup(dto)
        .then(() => null)
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toMatchObject({
        message: expect.arrayContaining([
          'This email is already registered',
          'This phone number is already registered',
        ]) as unknown[],
      });
    });
  });

  describe('resendOtp', () => {
    it('throws NotFoundException when the user does not exist', async () => {
      userRepo.findByEmail.mockResolvedValue(null);

      await expect(
        service.resendOtp(
          { email: 'missing@example.com' },
          'email-verification',
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws BadRequestException when the email is already verified', async () => {
      userRepo.findByEmail.mockResolvedValue(buildUser({ isVerified: true }));

      await expect(
        service.resendOtp({ email: 'test@example.com' }, 'email-verification'),
      ).rejects.toThrow('Email is already verified');
    });

    it('resends the code and returns the otp with a success message', async () => {
      userRepo.findByEmail.mockResolvedValue(buildUser({ isVerified: false }));

      await expect(
        service.resendOtp({ email: 'test@example.com' }, 'email-verification'),
      ).resolves.toEqual(undefined);

      expect(otpService.send).toHaveBeenCalledWith(
        'user-1',
        'email-verification',
      );
      expect(mailService.sendOtp).toHaveBeenCalledWith(
        'test@example.com',
        '1234',
      );
    });
  });

  describe('verifyEmail', () => {
    it('throws when the user does not exist', async () => {
      userRepo.findByEmail.mockResolvedValue(null);

      await expect(
        service.verifyEmail({ email: 'missing@example.com', otp: '1234' }),
      ).rejects.toThrow('User not found');
    });

    it('throws when the email is already verified', async () => {
      userRepo.findByEmail.mockResolvedValue(buildUser({ isVerified: true }));

      await expect(
        service.verifyEmail({ email: 'test@example.com', otp: '1234' }),
      ).rejects.toThrow('Email is already verified');
    });

    it('verifies the otp, marks the user verified and starts a session', async () => {
      const user = buildUser({ isVerified: false });
      userRepo.findByEmail.mockResolvedValue(user);

      const result = await service.verifyEmail(
        { email: 'test@example.com', otp: '1234' },
        'device-x',
      );

      expect(otpService.verify).toHaveBeenCalledWith(
        'user-1',
        'signup',
        '1234',
      );
      expect(otpService.consume).toHaveBeenCalledWith('user-1', 'signup');
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'user.verified',
        expect.objectContaining({ userId: 'user-1' }),
      );
      expect(user.isVerified).toBe(true);
      expect(userRepo.save).toHaveBeenCalledWith(user);

      expect(sessionRepo.createSessionWithToken).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-1', deviceInfo: 'device-x' }),
        expect.objectContaining({
          type: TokenType.REFRESH,
          jti: 'refresh-jti',
        }),
      );
      expect(result).toEqual({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      });
    });

    it('does not persist the user when otp verification fails', async () => {
      const user = buildUser({ isVerified: false });
      userRepo.findByEmail.mockResolvedValue(user);
      otpService.verify.mockRejectedValue(new BadRequestException('bad otp'));

      await expect(
        service.verifyEmail({ email: 'test@example.com', otp: '0000' }),
      ).rejects.toThrow('bad otp');

      expect(otpService.consume).not.toHaveBeenCalled();
      expect(userRepo.save).not.toHaveBeenCalled();
      expect(sessionRepo.createSessionWithToken).not.toHaveBeenCalled();
    });
  });

  describe('login', () => {
    const dto = { email: 'test@example.com', password: 'Password123!' };

    it('throws when the user does not exist without checking the password', async () => {
      userRepo.findByEmail.mockResolvedValue(null);

      await expect(service.login(dto)).rejects.toThrow(
        'Wrong email or password',
      );
      expect(securityService.verify).not.toHaveBeenCalled();
    });

    it('throws when the password does not match', async () => {
      userRepo.findByEmail.mockResolvedValue(
        buildUser({ isVerified: true, isActive: true }),
      );
      securityService.verify.mockResolvedValue(false);

      await expect(service.login(dto)).rejects.toThrow(
        'Wrong email or password',
      );
    });

    it('throws ForbiddenException when the account is deactivated', async () => {
      userRepo.findByEmail.mockResolvedValue(
        buildUser({ isActive: false, isVerified: true }),
      );

      await expect(service.login(dto)).rejects.toThrow(
        'Account has been deactivated',
      );
    });

    it('throws ForbiddenException when the account is not verified', async () => {
      userRepo.findByEmail.mockResolvedValue(
        buildUser({ isActive: true, isVerified: false }),
      );

      await expect(service.login(dto)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      await expect(service.login(dto)).rejects.toThrow(
        'Account has not been verified',
      );
    });

    it('returns a token pair for valid credentials', async () => {
      userRepo.findByEmail.mockResolvedValue(
        buildUser({ isActive: true, isVerified: true }),
      );

      const result = await service.login(dto, 'device-1');

      expect(securityService.verify).toHaveBeenCalledWith(
        'hashed-password',
        dto.password,
      );
      expect(tokenService.sign).toHaveBeenCalledWith(
        expect.objectContaining({
          sub: 'user-1',
          email: 'test@example.com',
          level: AccessLevel.VERIFIED,
        }),
        TokenType.REFRESH,
      );
      expect(sessionRepo.createSessionWithToken).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-1', deviceInfo: 'device-1' }),
        expect.objectContaining({ type: TokenType.REFRESH }),
      );
      expect(result).toEqual({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      });
    });
  });

  describe('forgetPassword', () => {
    it('throws NotFoundException when the email is unknown', async () => {
      userRepo.findByEmail.mockResolvedValue(null);

      await expect(
        service.forgetPassword({ email: 'missing@example.com' }),
      ).rejects.toThrow('this email not found');
    });

    it('sends a password-reset otp and returns a success message', async () => {
      userRepo.findByEmail.mockResolvedValue(buildUser());

      await expect(
        service.forgetPassword({ email: 'test@example.com' }),
      ).resolves.toEqual({ message: 'OTP sent successfully' });

      expect(otpService.send).toHaveBeenCalledWith('user-1', 'password-reset');
      expect(mailService.sendOtp).toHaveBeenCalledWith(
        'test@example.com',
        '1234',
      );
    });

    it('swallows mail delivery failures and still reports success', async () => {
      userRepo.findByEmail.mockResolvedValue(buildUser());
      mailService.sendOtp.mockRejectedValue(new Error('smtp down'));

      await expect(
        service.forgetPassword({ email: 'test@example.com' }),
      ).resolves.toEqual({ message: 'OTP sent successfully' });
      expect(console.error).toHaveBeenCalled();
    });
  });

  describe('refresh', () => {
    it('revokes the presented refresh token and issues a fresh token pair', async () => {
      const credentials = buildCredentials({ jti: 'refresh-jti-old' });

      const result = await service.refresh(credentials);

      expect(sessionRepo.revokeToken).toHaveBeenCalledWith('refresh-jti-old');
      expect(tokenService.sign).toHaveBeenCalledWith(
        expect.objectContaining({
          sub: credentials.decoded.sub,
          sid: credentials.decoded.sid,
          level: AccessLevel.VERIFIED,
        }),
        TokenType.REFRESH,
        undefined,
        expect.any(Number),
      );
      expect(sessionRepo.createToken).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: credentials.decoded.sub,
          sessionId: credentials.decoded.sid,
          type: TokenType.REFRESH,
          jti: 'refresh-jti',
        }),
      );
      expect(sessionRepo.createSessionWithToken).not.toHaveBeenCalled();
      expect(result).toEqual({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      });
    });
  });

  describe('verifyOtp', () => {
    it('throws NotFoundException when the email is unknown', async () => {
      userRepo.findByEmail.mockResolvedValue(null);

      await expect(
        service.verifyOtp({ email: 'missing@example.com', otp: '1234' }),
      ).rejects.toThrow('this email not found');
    });

    it('verifies the password-reset otp and returns a success message', async () => {
      userRepo.findByEmail.mockResolvedValue(buildUser());

      await expect(
        service.verifyOtp({ email: 'test@example.com', otp: '1234' }),
      ).resolves.toEqual({ message: 'OTP verified successfully' });

      expect(otpService.verify).toHaveBeenCalledWith(
        'user-1',
        'password-reset',
        '1234',
      );
    });
  });

  describe('resetPassword', () => {
    const dto = {
      email: 'test@example.com',
      password: 'NewPass123!',
      confirmPassword: 'NewPass123!',
    };

    it('throws NotFoundException when the email is unknown', async () => {
      userRepo.findByEmail.mockResolvedValue(null);

      await expect(service.resetPassword(dto)).rejects.toThrow(
        'this email not found',
      );
    });

    it('consumes the otp, hashes and persists the new password', async () => {
      const user = buildUser();
      const updateSpy = jest.spyOn(user, 'updatePassword');
      userRepo.findByEmail.mockResolvedValue(user);
      securityService.hash.mockResolvedValue('new-hash');

      await expect(service.resetPassword(dto)).resolves.toEqual({
        message: 'Password reset successfully',
      });

      expect(otpService.consume).toHaveBeenCalledWith(
        'user-1',
        'password-reset',
      );
      expect(securityService.hash).toHaveBeenCalledWith(dto.password);
      expect(updateSpy).toHaveBeenCalledWith('new-hash');
      expect(user.getPasswordHash()).toBe('new-hash');
      expect(userRepo.save).toHaveBeenCalledWith(user);
    });
  });

  describe('getAllUsers', () => {
    it('maps users to public fields and computes pagination meta', async () => {
      const users = [
        buildUser({ id: 'u1', email: 'a@example.com' }),
        buildUser({ id: 'u2', email: 'b@example.com', isVerified: true }),
      ];
      userRepo.findAll.mockResolvedValue([users, 23]);

      const result = await service.getAllUsers({ page: 2, limit: 10 });

      expect(userRepo.findAll).toHaveBeenCalledWith(2, 10);
      expect(result.meta).toEqual({
        total: 23,
        page: 2,
        limit: 10,
        totalPages: 3,
      });
      expect(result.data).toHaveLength(2);
      expect(result.data[0]).toEqual({
        id: 'u1',
        name: users[0].name,
        email: 'a@example.com',
        phone: users[0].phone,
        gender: users[0].gender,
        isActive: users[0].isActive,
        isVerified: users[0].isVerified,
        createdAt: users[0].createdAt,
      });
      expect(result.data[0]).not.toHaveProperty('password');
    });

    it('offsets from the first page by default', async () => {
      userRepo.findAll.mockResolvedValue([[], 0]);

      const result = await service.getAllUsers({ page: 1, limit: 10 });

      expect(userRepo.findAll).toHaveBeenCalledWith(1, 10);
      expect(result.meta.totalPages).toBe(0);
    });
  });

  describe('logout', () => {
    it('revokes only the current session by default', async () => {
      const credentials = buildCredentials();

      await service.logout(credentials);

      expect(sessionRepo.revokeSession).toHaveBeenCalledWith(
        credentials.decoded.sid,
      );
      expect(sessionRepo.revokeAllUserSessions).not.toHaveBeenCalled();
    });

    it('revokes every user session when logging out everywhere', async () => {
      const credentials = buildCredentials();

      await service.logout(credentials, true);

      expect(sessionRepo.revokeAllUserSessions).toHaveBeenCalledWith(
        credentials.decoded.sub,
      );
      expect(sessionRepo.revokeSession).not.toHaveBeenCalled();
    });
  });
});
