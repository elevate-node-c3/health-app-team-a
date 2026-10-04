import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common';
import { AccessLevel } from 'src/auth/domain/enums/access-level.enum';
import { REQUIRED_ACCESS_LEVELS_KEY } from 'src/common/utils/access-level.util';

import { AuthenticationGuard } from '../guards/authentication.guard';
import { AuthorizationGuard } from '../guards/authorization.guard';

export const IS_REFRESH_ROUTE_KEY = 'isRefreshRoute';
export const IS_OPTIONAL_AUTH_ROUTE_KEY = 'isOptionalAuthRoute';

/**
 * Account self-service: any authenticated user, verified or not.
 *
 * This is the deliberate exception to "an unverified user may do nothing a
 * guest cannot". Without it an unverified user could not reach their own
 * account to verify it, and the mode would be a dead end. Use it only for
 * routes that act on the caller's own account — never for feature work.
 */
export const AccountAccess = () => {
  return applyDecorators(
    SetMetadata(REQUIRED_ACCESS_LEVELS_KEY, [
      AccessLevel.UNVERIFIED,
      AccessLevel.VERIFIED,
    ]),
    UseGuards(AuthenticationGuard, AuthorizationGuard),
  );
};

/**
 * Verified users only — the default for anything that acts on the world.
 *
 * A guest is refused 401 by `AuthenticationGuard` before this is reached; an
 * unverified user is refused 403. Both are refused, which is the point.
 */
export const Verified = () => {
  return applyDecorators(
    SetMetadata(REQUIRED_ACCESS_LEVELS_KEY, [AccessLevel.VERIFIED]),
    UseGuards(AuthenticationGuard, AuthorizationGuard),
  );
};

export const RefreshAuth = () => {
  return applyDecorators(
    SetMetadata(IS_REFRESH_ROUTE_KEY, true),
    UseGuards(AuthenticationGuard),
  );
};

/**
 * Guest-safe: serves a request with or without a session, and rejects only an
 * invalid token. The handler must treat an absent `req.credentials` as a guest.
 *
 * Routes marked this way are readable by every mode, so they carry no
 * authorization metadata — personalization inside them keys off the presence of
 * a user and never off `isVerified`.
 */
export const OptionalAuth = () => {
  return applyDecorators(
    SetMetadata(IS_OPTIONAL_AUTH_ROUTE_KEY, true),
    UseGuards(AuthenticationGuard),
  );
};
