import type { ConsumeMessage } from 'amqplib';

/** One RabbitMQ `x-death` header entry — the broker's own dead-letter log. */
interface XDeathEntry {
  queue?: string;
  count?: number;
}

/**
 * How many times this message has previously been delivered to `queueName`
 * and failed, derived from the `x-death` header the broker stamps on every
 * dead-lettered message.
 *
 * The retry loop here is: main queue nacks → dead-lettered to the retry
 * exchange → retry queue holds it for `RETRY_DELAY_MS` → dead-lettered again
 * back to the main exchange → redelivered to the main queue. Each lap through
 * that loop adds one `x-death` entry whose `queue` is the main queue's own
 * name (RabbitMQ records the queue the message was dead-lettered *from*), and
 * that entry's `count` is how many times this exact loop has happened — so
 * reading `count` directly is both simpler and correct than counting array
 * length, which would only count distinct (queue, reason) pairs once.
 */
export function deliveryAttempt(
  message: ConsumeMessage,
  queueName: string,
): number {
  const deaths = message.properties.headers?.['x-death'] as
    XDeathEntry[] | undefined;
  const ownEntry = deaths?.find((entry) => entry.queue === queueName);
  return (ownEntry?.count ?? 0) + 1;
}
