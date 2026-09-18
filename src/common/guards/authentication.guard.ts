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
import { type Request } from 'express';
import { TokenType } from 'src/auth/domain/enums/token.enum';
import {
  SESSION_REPOSITORY,
  type SessionRepository,
} from 'src/auth/domain/repositories/session.repository';
import {
  IS_OPTIONAL_AUTH_ROUTE_KEY,
  IS_REFRESH_ROUTE_KEY,
} from 'src/common/decorators/auth.decorator';
import { IDecodedJwtPayload } from 'src/common/services/token/jwt.type';
import { TokenService } from 'src/common/services/token/token.service';

@Injectable()
export class AuthenticationGuard implements CanActivate {
  private readonly logger = new Logger(AuthenticationGuard.name);

  constructor(
    private readonly tokenService: TokenService,
    @Inject(SESSION_REPOSITORY)
    private readonly sessionRepo: SessionRepository,
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
    switch (context.getType()) {
      case 'http': {
        req = context.switchToHttp().getRequest<Request>();
        token = req.cookies[cookieName] as string;
        break;
      }
      case 'ws':
      case 'rpc':
    }

    if (!token || !req) {
      if (isOptionalAuthRoute) return true;
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

    return true;
  }

  private async assertRefreshTokenIsUsable(
    jti: string,
    userId: string,
  ): Promise<void> {
    const storedToken = await this.sessionRepo.findTokenByJti(jti);

    if (!storedToken || storedToken.userId !== userId)
      throw new UnauthorizedException();

    if (storedToken.revoked) {
      await this.sessionRepo.revokeSession(storedToken.sessionId);
      this.logger.warn(
        `Refresh token reuse detected for user ${userId}; session ${storedToken.sessionId} revoked`,
      );
      throw new UnauthorizedException();
    }

    if (!storedToken.isUsable()) throw new UnauthorizedException();
  }
}
