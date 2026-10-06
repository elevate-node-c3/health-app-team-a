import { Nack } from '@golevelup/nestjs-rabbitmq';
import { jest } from '@jest/globals';
import {
  DEAD_LETTER_EXCHANGE,
  MAX_DELIVERY_ATTEMPTS,
  consumerQueueName,
} from 'src/infrastructure/messaging/rabbitmq.constants';

import { MedicalQuestionAnswerListener } from './medical-question-answer.listener';
import { MedicalQuestionService } from './medical-question.service';

import type { ConsumeMessage } from 'amqplib';

const MEDICAL_QUESTION_ANSWER_SUBMITTED_EVENT =
  'medical-question.answer.submitted';
const QUEUE = consumerQueueName(
  'medical-question',
  MEDICAL_QUESTION_ANSWER_SUBMITTED_EVENT,
);
const HANDLER = MedicalQuestionAnswerListener.name;

const envelope = {
  eventId: 'event-1',
  eventName: MEDICAL_QUESTION_ANSWER_SUBMITTED_EVENT,
  occurredAt: '2026-10-05T14:00:00.000Z',
  version: 1 as const,
  payload: {
    questionId: 'question-1',
    answerText: 'Rest and hydrate; see a doctor if it persists.',
  },
};

/** A raw delivery whose `x-death` records `attempt - 1` prior failures. */
function rawMessage(attempt = 1): ConsumeMessage {
  const deaths =
    attempt > 1 ? [{ queue: QUEUE, count: attempt - 1 }] : undefined;
  return {
    properties: { headers: deaths ? { 'x-death': deaths } : {} },
  } as unknown as ConsumeMessage;
}

describe('MedicalQuestionAnswerListener', () => {
  function makeHarness(
    options: {
      claimed?: boolean;
      markAnswered?: MedicalQuestionService['markAnswered'];
    } = {},
  ) {
    const markAnswered = jest
      .fn<MedicalQuestionService['markAnswered']>()
      .mockImplementation(
        options.markAnswered ?? (() => Promise.resolve('ANSWERED')),
      );
    const medicalQuestionService = { markAnswered };

    const tryClaim = jest
      .fn<(eventId: string, handler: string) => Promise<boolean>>()
      .mockResolvedValue(options.claimed ?? true);
    const release = jest
      .fn<(eventId: string, handler: string) => Promise<void>>()
      .mockResolvedValue(undefined);
    const processedEvents = { tryClaim, release };

    const publish = jest
      .fn<
        (
          exchange: string,
          routingKey: string,
          message: unknown,
        ) => Promise<boolean>
      >()
      .mockResolvedValue(true);
    const amqpConnection = { publish };

    const listener = new MedicalQuestionAnswerListener(
      medicalQuestionService as never,
      processedEvents,
      amqpConnection as never,
    );

    return { listener, markAnswered, tryClaim, release, publish };
  }

  it('marks the question answered and acks on a genuine first delivery', async () => {
    const { listener, markAnswered, tryClaim } = makeHarness();

    const result = await listener.handleAnswerSubmitted(envelope, rawMessage());

    expect(tryClaim).toHaveBeenCalledWith('event-1', HANDLER);
    expect(markAnswered).toHaveBeenCalledWith(
      'question-1',
      envelope.payload.answerText,
      new Date(envelope.occurredAt),
    );
    expect(result).toBeUndefined();
  });

  it('acks without marking anything when the event was already claimed', async () => {
    const { listener, markAnswered, tryClaim } = makeHarness({
      claimed: false,
    });

    const result = await listener.handleAnswerSubmitted(envelope, rawMessage());

    expect(tryClaim).toHaveBeenCalledWith('event-1', HANDLER);
    expect(markAnswered).not.toHaveBeenCalled();
    expect(result).toBeUndefined();
  });

  it('acks without throwing when the question was already resolved', async () => {
    const { listener, release } = makeHarness({
      markAnswered: () => Promise.resolve('ALREADY_RESOLVED'),
    });

    const result = await listener.handleAnswerSubmitted(envelope, rawMessage());

    expect(release).not.toHaveBeenCalled();
    expect(result).toBeUndefined();
  });

  it('releases its claim and nacks for a retry when the question id is unknown', async () => {
    const { listener, release, publish } = makeHarness({
      markAnswered: () => Promise.resolve('NOT_FOUND'),
    });

    const result = await listener.handleAnswerSubmitted(
      envelope,
      rawMessage(1),
    );

    expect(release).toHaveBeenCalledWith('event-1', HANDLER);
    expect(result).toBeInstanceOf(Nack);
    expect((result as Nack).requeue).toBe(false);
    expect(publish).not.toHaveBeenCalled();
  });

  it('dead-letters and acks once the attempt cap is reached', async () => {
    const { listener, release, publish } = makeHarness({
      markAnswered: () => Promise.resolve('NOT_FOUND'),
    });

    const result = await listener.handleAnswerSubmitted(
      envelope,
      rawMessage(MAX_DELIVERY_ATTEMPTS),
    );

    expect(release).toHaveBeenCalledWith('event-1', HANDLER);
    expect(publish).toHaveBeenCalledWith(
      DEAD_LETTER_EXCHANGE,
      QUEUE,
      envelope,
      expect.anything(),
    );
    expect(result).toBeUndefined();
  });
});
