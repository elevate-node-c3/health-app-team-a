import { deliveryAttempt } from './delivery-attempt.util';

import type { ConsumeMessage } from 'amqplib';

function messageWithDeaths(
  deaths?: { queue: string; count: number }[],
): ConsumeMessage {
  return {
    properties: { headers: deaths ? { 'x-death': deaths } : {} },
  };
}

describe('deliveryAttempt', () => {
  it('is 1 for a first delivery with no x-death header', () => {
    expect(
      deliveryAttempt(messageWithDeaths(), 'email.appointment.booked'),
    ).toBe(1);
  });

  it('adds 1 to the recorded count for this queue', () => {
    const message = messageWithDeaths([
      { queue: 'email.appointment.booked', count: 2 },
    ]);

    expect(deliveryAttempt(message, 'email.appointment.booked')).toBe(3);
  });

  // x-death entries accumulate per (queue, reason, exchange) triple, so a
  // different consumer's queue in the same header must not inflate this
  // queue's own attempt count.
  it('ignores x-death entries for a different queue', () => {
    const message = messageWithDeaths([
      { queue: 'sms.appointment.booked', count: 5 },
    ]);

    expect(deliveryAttempt(message, 'email.appointment.booked')).toBe(1);
  });
});
