/**
 * The three modes a request can be in. Resolved per request by `accessLevelOf`
 * in `src/common/decorators/auth.decorator.ts`, which is the only producer.
 *
 * For authorization GUEST and UNVERIFIED are equals: any action a guest cannot
 * perform is equally unavailable to an unverified user. What UNVERIFIED buys is
 * a richer journey, not more permissions — the extra profile information makes
 * personalization possible, and nothing else. The single exception is account
 * self-service (`@AccountAccess()`), without which an unverified user could
 * never reach their own account to verify it.
 *
 * Verification state is read from `users.isVerified` every request. The `level`
 * claim in the JWT is NOT authoritative and must not be trusted: a token minted
 * before verification would pin a stale UNVERIFIED for the life of the session.
 */
export enum AccessLevel {
  /** No session on the request at all. */
  GUEST = 'guest',
  /** Has an account, has not completed verification. */
  UNVERIFIED = 'unverified',
  /** Has completed verification; the only mode that may act. */
  VERIFIED = 'verified',
}
