import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { TokenType } from 'src/auth/domain/enums/token.enum';
import { SecurityService } from 'src/common/services/security/security.service';
import { TokenService } from 'src/common/services/token/token.service';
import { RedisService } from 'src/infrastructure/cache/redis.service';

import { AuthService } from './auth.service';
import { UserCredentials } from './auth.type';
import { Session } from './domain/entities/session.model';
import { User } from './domain/entities/user.model';
import {
  SESSION_REPOSITORY,
  SessionRepository,
} from './domain/repositories/session.repository';
import {
  USER_REPOSITORY,
  UserRepository,
} from './domain/repositories/user.repository';

describe('AuthService', () => {
  let securityService: SecurityService;
  let tokenService: TokenService;
  let sessionRepo: jest.Mocked<SessionRepository>;
  let userRepo: jest.Mocked<UserRepository>;
  let service: AuthService;

  const signed = (token: string) => ({
    token,
    jti: `${token}-jti`,
    expiresAt: new Date(Date.now() + 60_000),
  });

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: SecurityService, useValue: { verify: jest.fn() } },
        {
          provide: TokenService,
          useValue: { sign: jest.fn(), verify: jest.fn() },
        },
        {
          provide: RedisService,
          useValue: { set: jest.fn(), revokedTokenKey: jest.fn() },
        },
        {
          provide: SESSION_REPOSITORY,
          useValue: {
            createSessionWithToken: jest.fn(),
            findSessionWithUser: jest.fn(),
            createToken: jest.fn(),
            findTokenByJti: jest.fn(),
            revokeToken: jest.fn(),
            revokeSession: jest.fn(),
            revokeAllUserSessions: jest.fn(),
          },
        },
        {
          provide: USER_REPOSITORY,
          useValue: {
            findById: jest.fn(),
            findByEmail: jest.fn(),
            save: jest.fn(),
          },
        },
      ],
    }).compile();

    securityService = module.get<SecurityService>(SecurityService);
    tokenService = module.get<TokenService>(TokenService);
    sessionRepo = module.get(SESSION_REPOSITORY);
    userRepo = module.get(USER_REPOSITORY);
    service = module.get<AuthService>(AuthService);
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
      (userRepo.findByEmail as jest.Mock).mockResolvedValue(null);
      (securityService.verify as jest.Mock).mockResolvedValue(false);

      await expect(service.login(fakeDto)).rejects.toThrow(BadRequestException);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(userRepo.findByEmail).toHaveBeenCalledWith(fakeDto.email);
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

    it('opens a session and persists only the refresh token', async () => {
      (tokenService.sign as jest.Mock)
        .mockResolvedValueOnce(signed('refresh-token'))
        .mockResolvedValueOnce(signed('access-token'));
      (userRepo.findByEmail as jest.Mock).mockResolvedValue(fakeFoundUser);
      (securityService.verify as jest.Mock).mockResolvedValue(true);

      await expect(service.login(fakeDto, 'jest-agent')).resolves.toEqual({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      });

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(sessionRepo.createSessionWithToken).toHaveBeenCalledWith(
        expect.objectContaining({ userId: '123', deviceInfo: 'jest-agent' }),
        expect.objectContaining({
          userId: '123',
          type: TokenType.REFRESH,
          jti: 'refresh-token-jti',
        }),
      );

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(sessionRepo.createToken).not.toHaveBeenCalled();
    });

    it('signs both tokens with the same session id', async () => {
      (tokenService.sign as jest.Mock)
        .mockResolvedValueOnce(signed('refresh-token'))
        .mockResolvedValueOnce(signed('access-token'));
      (userRepo.findByEmail as jest.Mock).mockResolvedValue(fakeFoundUser);
      (securityService.verify as jest.Mock).mockResolvedValue(true);

      await service.login(fakeDto);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      const signMock = tokenService.sign as jest.Mock;
      const [refreshPayload] = signMock.mock.calls[0] as [{ sid: string }];
      const [accessPayload] = signMock.mock.calls[1] as [{ sid: string }];

      expect(refreshPayload.sid).toBe(accessPayload.sid);
      expect(refreshPayload.sid).toEqual(expect.any(String));
    });
  });

  describe('refresh', () => {
    const sessionEndsAt = new Date(Date.now() + 60 * 60 * 1000);

    const credentials = {
      user: { email: 'test@expenseflow.com', accessLevel: 'verified' } as User,
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
      (tokenService.sign as jest.Mock)
        .mockResolvedValueOnce(signed('new-refresh-token'))
        .mockResolvedValueOnce(signed('new-access-token'));

      await expect(service.refresh(credentials)).resolves.toEqual({
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
      });

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(sessionRepo.revokeToken).toHaveBeenCalledWith('old-jti');

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(sessionRepo.createToken).toHaveBeenCalledWith(
        expect.objectContaining({ sessionId: 'session-1' }),
      );
      // eslint-disable-next-line @typescript-eslint/unbound-method
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

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(sessionRepo.revokeSession).toHaveBeenCalledWith('session-1');
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(sessionRepo.revokeAllUserSessions).not.toHaveBeenCalled();
    });

    it('revokes every session when the everywhere flag is set', async () => {
      await service.logout(credentials, true);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(sessionRepo.revokeAllUserSessions).toHaveBeenCalledWith('123');
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(sessionRepo.revokeSession).not.toHaveBeenCalled();
    });
  });
});
