import { jest } from '@jest/globals';
import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AccessLevel } from 'src/auth/domain/enums/access-level.enum';

import { AuthorizationGuard } from './authorization.guard';

import type { Request } from 'express';
import type { UserCredentials } from 'src/auth/auth.type';

/** The three modes, built the way a request actually carries them. */
const REQUESTS: Record<AccessLevel, () => Partial<Request>> = {
  // A guest is the absence of credentials, not a flag.
  [AccessLevel.GUEST]: () => ({}),
  [AccessLevel.UNVERIFIED]: () => ({
    credentials: { user: { isVerified: false } } as UserCredentials,
  }),
  [AccessLevel.VERIFIED]: () => ({
    credentials: { user: { isVerified: true } } as UserCredentials,
  }),
};

/** What each decorator writes into route metadata. */
const ACCOUNT_ACCESS = [AccessLevel.UNVERIFIED, AccessLevel.VERIFIED];
const VERIFIED_ONLY = [AccessLevel.VERIFIED];

function contextFor(req: Partial<Request>): ExecutionContext {
  return {
    getType: () => 'http',
    getHandler: () => () => undefined,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

/**
 * A guard whose route metadata is `required`. Stubbing the reflector rather
 * than compiling a Nest module keeps the rule table readable; the decorators
 * are checked against real controllers in access-level.http.spec.ts.
 */
function guardWith(required: AccessLevel[] | undefined): AuthorizationGuard {
  const reflector = new Reflector();
  jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(required);
  return new AuthorizationGuard(reflector);
}

function run(
  required: AccessLevel[] | undefined,
  mode: AccessLevel,
): boolean | ForbiddenException {
  const guard = guardWith(required);
  try {
    return guard.canActivate(contextFor(REQUESTS[mode]()));
  } catch (error) {
    return error as ForbiddenException;
  }
}

describe('AuthorizationGuard', () => {
  describe('@Verified() admits only a verified user', () => {
    it('allows a verified user', () => {
      expect(run(VERIFIED_ONLY, AccessLevel.VERIFIED)).toBe(true);
    });

    // The core business rule: an unverified user is refused exactly as a guest
    // is. If this ever passes, unverified users have gained a guest-forbidden
    // action.
    it.each([AccessLevel.UNVERIFIED, AccessLevel.GUEST])(
      'refuses %s',
      (mode) => {
        const outcome = run(VERIFIED_ONLY, mode);
        expect(outcome).toBeInstanceOf(ForbiddenException);
        expect((outcome as ForbiddenException).message).toBe(
          'Please verify your account to perform this action',
        );
      },
    );

    it('refuses guest and unverified identically', () => {
      const guest = run(VERIFIED_ONLY, AccessLevel.GUEST);
      const unverified = run(VERIFIED_ONLY, AccessLevel.UNVERIFIED);

      expect((guest as ForbiddenException).message).toBe(
        (unverified as ForbiddenException).message,
      );
    });
  });

  describe('@AccountAccess() admits any authenticated user', () => {
    it.each([AccessLevel.UNVERIFIED, AccessLevel.VERIFIED])(
      'allows %s',
      (mode) => {
        expect(run(ACCOUNT_ACCESS, mode)).toBe(true);
      },
    );

    // The carve-out exists so an unverified user can reach their own account;
    // it must not extend to a guest, who has no account to reach.
    it('refuses a guest', () => {
      expect(run(ACCOUNT_ACCESS, AccessLevel.GUEST)).toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  describe('routes carrying no requirement', () => {
    // @OptionalAuth() and the public routes set no metadata. Absent metadata
    // means nothing was asked for, so every mode passes.
    it.each([AccessLevel.GUEST, AccessLevel.UNVERIFIED, AccessLevel.VERIFIED])(
      'allows %s when metadata is absent',
      (mode) => {
        expect(run(undefined, mode)).toBe(true);
      },
    );

    it('allows every mode when metadata is an empty set', () => {
      expect(run([], AccessLevel.GUEST)).toBe(true);
    });
  });
});
