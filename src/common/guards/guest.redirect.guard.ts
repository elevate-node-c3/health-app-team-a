import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Response, Request } from 'express';

import { IS_REFRESH_ROUTE_KEY } from '../decorators/auth.decorator';

@Injectable()
export class GuestRedirectGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}
  canActivate(context: ExecutionContext): boolean {
    const isRefreshRoute = this.reflector.getAllAndOverride<boolean>(
      IS_REFRESH_ROUTE_KEY,
      [context.getHandler(), context.getClass()],
    );

    const cookieName = isRefreshRoute ? 'refreshToken' : 'accessToken';

    let token: string | null = null;
    let req: Request | null = null;
    let res: Response | null = null;

    switch (context.getType()) {
      case 'http': {
        req = context.switchToHttp().getRequest<Request>();
        res = context.switchToHttp().getResponse<Response>();
        token = req.cookies[cookieName] as string;
        break;
      }
    }

    if (!req || !res) throw new UnauthorizedException();
    if (!token) {
      res.status(302).redirect('/login');
      return false;
    }
    return true;
  }
}
