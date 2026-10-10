export interface EventEnvelope<TPayload = Record<string, unknown>> {
  eventId: string;
  eventName: string;
  occurredAt: string;
  version: 1;
  payload: TPayload;
}

export interface EventPublisher {
  emit(eventName: string, payload: Record<string, unknown>): void;
  publishRecorded(
    eventName: string,
    eventId: string,
    payload: Record<string, unknown>,
    occurredAt: Date,
  ): Promise<void>;
}

export const EVENT_PUBLISHER = Symbol('EVENT_PUBLISHER');
