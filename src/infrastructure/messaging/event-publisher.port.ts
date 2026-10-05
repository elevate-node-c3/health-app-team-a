/**
 * The envelope every message on the events exchange carries.
 *
 * Centralizing the shape here is the payload convention the rest of the app
 * follows: a consumer should never need to know whether a field is in the
 * envelope or the payload by guessing.
 */
export interface EventEnvelope<TPayload = Record<string, unknown>> {
  /**
   * The `outbox_events` row id. Doubles as the idempotency key: it is stable
   * across redeliveries of the same event, which is what lets a consumer
   * detect a duplicate.
   */
  eventId: string;
  /** Also the routing key this message was published with. */
  eventName: string;
  /** When the event happened, not when it was published or delivered. */
  occurredAt: string;
  /** Schema version, so a consumer can reject a shape it predates. */
  version: 1;
  payload: TPayload;
}

/**
 * Publishes a domain event onto the events exchange.
 *
 * A port rather than a direct `AmqpConnection` dependency, so no module other
 * than `MessagingModule` needs to know RabbitMQ is involved at all — the
 * requirement that individual modules not build their own messaging
 * infrastructure is enforced by this being the only way in.
 *
 * Two methods because there are genuinely two publishing situations in the
 * app, not one:
 */
export interface EventPublisher {
  /**
   * Fire-and-forget. Generates the event id and timestamp itself. Never
   * throws into the caller and never blocks it on a broker round-trip: a
   * failed publish is logged and swallowed, because every caller of `emit`
   * today is a request path (Home, a doctor profile read, signup) that could
   * not fail on a missing listener under the previous in-process emitter,
   * and must not start failing on a slow broker now.
   */
  emit(eventName: string, payload: Record<string, unknown>): void;

  /**
   * Publishes an event already durably recorded elsewhere (the transactional
   * outbox), under its own id and recorded time. Resolves only once the
   * broker has confirmed the message (publisher confirms) — resolving
   * earlier would let a caller mark the event delivered before it actually
   * reached the exchange, which is what the outbox's publish-then-mark
   * ordering depends on.
   */
  publishRecorded(
    eventName: string,
    eventId: string,
    payload: Record<string, unknown>,
    occurredAt: Date,
  ): Promise<void>;
}

export const EVENT_PUBLISHER = Symbol('EVENT_PUBLISHER');
