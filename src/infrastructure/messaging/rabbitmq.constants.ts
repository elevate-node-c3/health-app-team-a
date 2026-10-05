import {
  APPOINTMENT_BOOKED_EVENT,
  DOCTOR_PROFILE_VIEWED_EVENT,
  HOME_OPENED_EVENT,
  MAP_REGION_SEARCHED_EVENT,
  MEDICAL_QUESTION_ANSWER_SUBMITTED_EVENT,
} from './event-names';

/**
 * The app's one topic exchange. Every published event's routing key is its
 * event name, so a consumer binds to the specific events it wants
 * (`appointment.booked`) or a whole family (`appointment.#`).
 */
export const EVENTS_EXCHANGE = 'health.events';

/**
 * Where a handler's queue is bound after `nack`, so the message waits out of
 * the way instead of being redelivered immediately. `x-message-ttl` on the
 * retry queue below controls how long it waits.
 */
export const RETRY_EXCHANGE = 'health.events.retry';

/** Where a message lands once it has exhausted its retries. */
export const DEAD_LETTER_EXCHANGE = 'health.events.dlx';

/** How long a message waits in the retry queue before another attempt. */
export const RETRY_DELAY_MS = 30_000;

/** Attempts before a message is parked in its handler's DLQ. */
export const MAX_DELIVERY_ATTEMPTS = 3;

/**
 * Queue and routing-key names for one consumer of one event.
 *
 * Named `<consumer>.<event>` rather than `<event>` alone: a queue belongs to
 * one consumer, so a second consumer of the same event gets its own queue and
 * its own failures, never sharing (and draining) the first consumer's queue.
 */
export function consumerQueueName(consumer: string, eventName: string): string {
  return `${consumer}.${eventName}`;
}

export function retryQueueName(consumer: string, eventName: string): string {
  return `${consumerQueueName(consumer, eventName)}.retry`;
}

export function deadLetterQueueName(
  consumer: string,
  eventName: string,
): string {
  return `${consumerQueueName(consumer, eventName)}.dlq`;
}

/** One consumer's binding to one event. */
export interface ReliableConsumerBinding {
  consumer: string;
  eventName: string;
}

/**
 * Every durable consumer binding in the app, in one place.
 *
 * `MessagingModule` reads this list to assert each consumer's retry and
 * dead-letter queues centrally — a new consumer adds one entry here (and
 * nowhere else), rather than declaring its own retry/DLQ topology.
 *
 * This is the **reliable** tier: a message a handler failed to process is
 * retried up to `MAX_DELIVERY_ATTEMPTS` times, then dead-lettered rather than
 * dropped. Reserved for events whose consumer has a real side effect worth
 * not losing — today just the booking confirmation email.
 */
export const RELIABLE_CONSUMERS: readonly ReliableConsumerBinding[] = [
  { consumer: 'email', eventName: APPOINTMENT_BOOKED_EVENT },
  {
    consumer: 'medical-question',
    eventName: MEDICAL_QUESTION_ANSWER_SUBMITTED_EVENT,
  },
];

/**
 * The **lossy** tier: analytics consumers that `logger.log()` and must never
 * block or retry. Each still gets a durable queue — so an app restart does
 * not drop whatever is already enqueued — but the queue carries no
 * dead-letter exchange and the handler acks on every outcome, including a
 * thrown error, via `errorHandler: ackErrorHandler`. There is no DLQ to
 * assert here, unlike the reliable tier, because a lost log line is
 * acceptable and a parked one is not worth triaging.
 */
export const ANALYTICS_CONSUMERS: readonly ReliableConsumerBinding[] = [
  { consumer: 'analytics', eventName: DOCTOR_PROFILE_VIEWED_EVENT },
  { consumer: 'analytics', eventName: HOME_OPENED_EVENT },
  { consumer: 'analytics', eventName: MAP_REGION_SEARCHED_EVENT },
];
