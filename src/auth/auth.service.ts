import { randomUUID } from 'crypto';

import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { TokenType } from 'src/auth/domain/enums/token.enum';
import { SecurityService } from 'src/common/services/security/security.service';
import { IJwtUserPayload } from 'src/common/services/token/jwt.type';
import { TokenService } from 'src/common/services/token/token.service';

import { TokenPair, UserCredentials } from './auth.type';
import { Session } from './domain/entities/session.model';
import { User } from './domain/entities/user.model';
import {
  SESSION_REPOSITORY,
  type SessionRepository,
} from './domain/repositories/session.repository';
import {
  USER_REPOSITORY,
  type UserRepository,
} from './domain/repositories/user.repository';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepo: UserRepository,
    @Inject(SESSION_REPOSITORY)
    private readonly sessionRepo: SessionRepository,
    private readonly securityService: SecurityService,
    private readonly tokenService: TokenService,
  ) {}

  async login(
    dto: LoginDto,
    deviceInfo: string | null = null,
  ): Promise<TokenPair> {
    const { email, password } = dto;
    const user = await this.userRepo.findByEmail(email);

    if (
      !user ||
      !(await this.securityService.verify(user.getPasswordHash(), password))
    )
      throw new BadRequestException('Wrong email or password');

    if (!user.isActive)
      throw new ForbiddenException('Account has been deactivated');

    return await this.startSession(user, deviceInfo);
  }

  async refresh(credentials: UserCredentials): Promise<TokenPair> {
    const { sub, email, sid, jti } = credentials.decoded;

    await this.sessionRepo.revokeToken(jti);

    return await this.issueTokenPair(
      { sub, email, sid, level: credentials.user.accessLevel },
      credentials.session,
    );
  }

  async logout(
    credentials: UserCredentials,
    everywhere = false,
  ): Promise<void> {
    const { sub, sid } = credentials.decoded;

    if (everywhere) await this.sessionRepo.revokeAllUserSessions(sub);
    else await this.sessionRepo.revokeSession(sid);
  }

  private async startSession(
    user: User,
    deviceInfo: string | null,
  ): Promise<TokenPair> {
    const sid = randomUUID();

    const payload: IJwtUserPayload = {
      sub: user.id,
      email: user.email,
      sid,
      level: user.accessLevel,
    };

    const refresh = await this.tokenService.sign(payload, TokenType.REFRESH);

    await this.sessionRepo.createSessionWithToken(
      {
        id: sid,
        userId: user.id,
        deviceInfo,
        expiresAt: refresh.expiresAt,
      },
      {
        userId: user.id,
        sessionId: sid,
        type: TokenType.REFRESH,
        jti: refresh.jti,
        expiresAt: refresh.expiresAt,
      },
    );

    const access = await this.tokenService.sign(payload, TokenType.ACCESS);

    return { accessToken: access.token, refreshToken: refresh.token };
  }

  private async issueTokenPair(
    payload: IJwtUserPayload,
    session: Session,
  ): Promise<TokenPair> {
    const refresh = await this.tokenService.sign(
      payload,
      TokenType.REFRESH,
      undefined,
      this.secondsUntilSessionEnds(session),
    );

    await this.sessionRepo.createToken({
      userId: payload.sub,
      sessionId: payload.sid,
      type: TokenType.REFRESH,
      jti: refresh.jti,
      expiresAt: refresh.expiresAt,
    });

    const access = await this.tokenService.sign(payload, TokenType.ACCESS);

    return { accessToken: access.token, refreshToken: refresh.token };
  }

  private secondsUntilSessionEnds(session: Session): number {
    const remainingMs = session.expiresAt.getTime() - Date.now();
    return Math.max(1, Math.floor(remainingMs / 1000));
  }
}
