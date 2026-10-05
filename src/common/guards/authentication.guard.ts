import { randomUUID } from 'crypto';

import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Inject,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { type Request, type Response } from 'express';
import { AccessLevel } from 'src/auth/domain/enums/access-level.enum';
import { TokenType } from 'src/auth/domain/enums/token.enum';
import {
  SESSION_REPOSITORY,
  type SessionRepository,
} from 'src/auth/domain/repositories/session.repository';
import {
  AUTH_UNIT_OF_WORK,
  type AuthUnitOfWork,
} from 'src/auth/domain/repositories/unit-of-work';
import {
  IS_OPTIONAL_AUTH_ROUTE_KEY,
  IS_REFRESH_ROUTE_KEY,
} from 'src/common/decorators/auth.decorator';
import { IDecodedJwtPayload } from 'src/common/services/token/jwt.type';
import { TokenService } from 'src/common/services/token/token.service';
import { accessLevelOf } from 'src/common/utils/access-level.util';
import { DEVICE_ID_COOKIE, DEVICE_ID_COOKIE_OPTION } from 'src/config/cookie';

@Injectable()
export class AuthenticationGuard implements CanActivate {
  private readonly logger = new Logger(AuthenticationGuard.name);

  constructor(
    private readonly tokenService: TokenService,
    @Inject(SESSION_REPOSITORY)
    private readonly sessionRepo: SessionRepository,
    @Inject(AUTH_UNIT_OF_WORK)
    private readonly unitOfWork: AuthUnitOfWork,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isRefreshRoute = this.reflector.getAllAndOverride<boolean>(
      IS_REFRESH_ROUTE_KEY,
      [context.getHandler(), context.getClass()],
    );
    const isOptionalAuthRoute = this.reflector.getAllAndOverride<boolean>(
      IS_OPTIONAL_AUTH_ROUTE_KEY,
      [context.getHandler(), context.getClass()],
    );
    const tokenType = isRefreshRoute ? TokenType.REFRESH : TokenType.ACCESS;
    const cookieName = isRefreshRoute ? 'refreshToken' : 'accessToken';

    let token: string | null = null;
    let req: Request | null = null;
    let res: Response | null = null;
    switch (context.getType()) {
      case 'http': {
        const http = context.switchToHttp();
        req = http.getRequest<Request>();
        res = http.getResponse<Response>();
        token = req.cookies[cookieName] as string;
        break;
      }
      case 'ws':
      case 'rpc':
    }

    if (!token || !req) {
      if (isOptionalAuthRoute) {
        if (req) {
          req.accessLevel = AccessLevel.GUEST;
          if (res) this.ensureDeviceId(req, res);
        }
        return true;
      }
      throw new UnauthorizedException();
    }

    let decoded: IDecodedJwtPayload;
    try {
      decoded = (await this.tokenService.verify(
        token,
        tokenType,
      )) as IDecodedJwtPayload;
    } catch {
      throw new UnauthorizedException();
    }

    const { jti, sub, sid } = decoded;

    if (isRefreshRoute) await this.assertRefreshTokenIsUsable(jti, sub);

    const found = await this.sessionRepo.findSessionWithUser(sid);

    if (!found || found.session.userId !== sub || !found.session.isUsable())
      throw new UnauthorizedException();

    const { session, user } = found;

    if (!user.isActive)
      throw new ForbiddenException('Account has been deactivated');

    req.credentials = { user, session, decoded };
    // Resolved from the freshly loaded user, never from the token's `level`
    // claim, which would be stale for a session opened before verification.
    req.accessLevel = accessLevelOf(req);
    if (res) this.ensureDeviceId(req, res);

    return true;
  }

  /**
   * Assigns a persistent anonymous visitor id to any request that doesn't
   * already carry a valid one, regardless of auth outcome, so guest-facing
   * features can key off `req.deviceId` without each managing its own cookie.
   */
  private ensureDeviceId(req: Request, res: Response): void {
    const current = req.cookies?.[DEVICE_ID_COOKIE] as string | undefined;
    const deviceId =
      current && /^[0-9a-f-]{36}$/i.test(current) ? current : randomUUID();

    req.deviceId = deviceId;

    if (deviceId !== current)
      res.cookie(DEVICE_ID_COOKIE, deviceId, DEVICE_ID_COOKIE_OPTION);
  }

  private async assertRefreshTokenIsUsable(
    jti: string,
    userId: string,
  ): Promise<void> {
    const storedToken = await this.sessionRepo.findTokenByJti(jti);

    if (!storedToken || storedToken.userId !== userId)
      throw new UnauthorizedException();

    if (storedToken.revoked) {
      // Token reuse means the refresh token leaked, so the whole session dies.
      // Revoking tokens and session together, or a half-revoked session stays
      // usable by the attacker.
      await this.unitOfWork.execute(({ sessions }) =>
        sessions.revokeSession(storedToken.sessionId),
      );
      this.logger.warn(
        `Refresh token reuse detected for user ${userId}; session ${storedToken.sessionId} revoked`,
      );
      throw new UnauthorizedException();
    }

    if (!storedToken.isUsable()) throw new UnauthorizedException();
  }
}
