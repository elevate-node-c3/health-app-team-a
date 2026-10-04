import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { type Request } from 'express';
import { AccessLevel } from 'src/auth/domain/enums/access-level.enum';
import {
  accessLevelOf,
  REQUIRED_ACCESS_LEVELS_KEY,
} from 'src/common/utils/access-level.util';

/**
 * Answers "may this mode call this route", and nothing else. Who the caller is
 * has already been settled by `AuthenticationGuard`, which runs first and has
 * thrown 401 by now if a session was required and missing.
 *
 * The policy is an allowed-set per route rather than a rank, because the modes
 * do not form a useful ordering: GUEST and UNVERIFIED are equal for every
 * permission, yet `@AccountAccess()` admits UNVERIFIED while refusing GUEST.
 */
@Injectable()
export class AuthorizationGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<AccessLevel[]>(
      REQUIRED_ACCESS_LEVELS_KEY,
      [context.getHandler(), context.getClass()],
    );

    // Only a decorator puts this guard on a route, and every such decorator
    // sets the metadata. Absent metadata therefore means no restriction was
    // asked for rather than one that failed to load.
    if (!required?.length) return true;

    if (context.getType() !== 'http') return true;

    const req = context.switchToHttp().getRequest<Request>();
    if (required.includes(accessLevelOf(req))) return true;

    // One message for all 19 verified-only routes. An unverified user is
    // refused here exactly as a guest is, so the wording must not promise that
    // signing in would have helped.
    throw new ForbiddenException(
      'Please verify your account to perform this action',
    );
  }
}
