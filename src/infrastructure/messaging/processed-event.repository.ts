/**
 * Claims and releases a consumer's idempotency marker for one event.
 *
 * Deliberately not a generic key-value store: the composite claim is the
 * whole point, and a narrow interface keeps a consumer from reaching for
 * anything beyond claim/release.
 */
export interface ProcessedEventRepository {
  /**
   * Attempts to claim `(eventId, handler)`. Returns `true` if this call made
   * the claim — the caller should run its side effect. Returns `false` if the
   * claim already existed — the caller should ack and skip, because another
   * delivery (or an earlier attempt of this one) already handled it.
   */
  tryClaim(eventId: string, handler: string): Promise<boolean>;

  /**
   * Releases a claim after its side effect failed, so a genuine retry is not
   * permanently blocked by its own first, failed attempt.
   */
  release(eventId: string, handler: string): Promise<void>;
}

export const PROCESSED_EVENT_REPOSITORY = Symbol('PROCESSED_EVENT_REPOSITORY');
