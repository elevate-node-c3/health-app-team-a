import { AccessLevel } from 'src/auth/domain/enums/access-level.enum';

import type { Request } from 'express';

/**
 * Route metadata holding the set of modes a route admits. Lives here rather
 * than beside the decorators so `AuthorizationGuard` and `auth.decorator.ts`
 * can both read it without importing each other.
 */
export const REQUIRED_ACCESS_LEVELS_KEY = 'requiredAccessLevels';

/**
 * The mode this request is in — the one producer of `AccessLevel` in the app.
 *
 * Derived from `req.credentials` rather than from a field someone remembered to
 * set, so it is correct even on the fully public routes, which run no guard at
 * all. No credentials means no session, which is precisely what a guest is.
 */
export function accessLevelOf(req: Request): AccessLevel {
  const user = req.credentials?.user;
  if (!user) return AccessLevel.GUEST;
  return user.isVerified ? AccessLevel.VERIFIED : AccessLevel.UNVERIFIED;
}
