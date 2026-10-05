import {
  AmqpConnection,
  Nack,
  RabbitSubscribe,
} from '@golevelup/nestjs-rabbitmq';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { deliveryAttempt } from 'src/infrastructure/messaging/delivery-attempt.util';
import { MEDICAL_QUESTION_ANSWER_SUBMITTED_EVENT } from 'src/infrastructure/messaging/event-names';
import { PROCESSED_EVENT_REPOSITORY } from 'src/infrastructure/messaging/processed-event.repository';
import {
  DEAD_LETTER_EXCHANGE,
  EVENTS_EXCHANGE,
  MAX_DELIVERY_ATTEMPTS,
  RETRY_EXCHANGE,
  consumerQueueName,
} from 'src/infrastructure/messaging/rabbitmq.constants';

import { MedicalQuestionService } from './medical-question.service';

import type { ConsumeMessage } from 'amqplib';
import type { EventEnvelope } from 'src/infrastructure/messaging/event-publisher.port';
import type { ProcessedEventRepository } from 'src/infrastructure/messaging/processed-event.repository';

/**
 * Published by the external admin/doctor system onto `EVENTS_EXCHANGE`, not
 * by anything in this repository — this is the integration contract the
 * external system must honour.
 */
export interface MedicalQuestionAnswerSubmittedPayload {
  questionId: string;
  answerText: string;
}

const CONSUMER_NAME = 'medical-question';
const QUEUE = consumerQueueName(
  CONSUMER_NAME,
  MEDICAL_QUESTION_ANSWER_SUBMITTED_EVENT,
);

@Injectable()
export class MedicalQuestionAnswerListener {
  private readonly logger = new Logger(MedicalQuestionAnswerListener.name);

  constructor(
    private readonly medicalQuestionService: MedicalQuestionService,
    @Inject(PROCESSED_EVENT_REPOSITORY)
    private readonly processedEvents: ProcessedEventRepository,
    private readonly amqpConnection: AmqpConnection,
  ) {}

  /**
   * The main queue's retry/DLQ destination is asserted centrally by
   * `MessagingModule` from `RELIABLE_CONSUMERS` — this decorator only names
   * where messages that fail here should go, not how that destination is
   * built.
   */
  @RabbitSubscribe({
    exchange: EVENTS_EXCHANGE,
    routingKey: MEDICAL_QUESTION_ANSWER_SUBMITTED_EVENT,
    queue: QUEUE,
    queueOptions: {
      durable: true,
      deadLetterExchange: RETRY_EXCHANGE,
      deadLetterRoutingKey: QUEUE,
    },
  })
  async handleAnswerSubmitted(
    message: EventEnvelope<MedicalQuestionAnswerSubmittedPayload>,
    rawMessage: ConsumeMessage,
  ): Promise<Nack | undefined> {
    // Claimed before any side effect: a redelivery of an event this handler
    // already completed finds the claim already taken and acks here without
    // recording a second answer.
    const claimed = await this.processedEvents.tryClaim(
      message.eventId,
      MedicalQuestionAnswerListener.name,
    );
    if (!claimed) return undefined;

    try {
      const result = await this.medicalQuestionService.markAnswered(
        message.payload.questionId,
        message.payload.answerText,
        new Date(message.occurredAt),
      );
      if (result === 'NOT_FOUND')
        throw new Error(
          `Unknown medical question ${message.payload.questionId}`,
        );
      return undefined;
    } catch (error) {
      // The side effect did not happen, so the claim must not stand — a
      // genuine retry needs to be able to claim again.
      await this.processedEvents.release(
        message.eventId,
        MedicalQuestionAnswerListener.name,
      );
      return this.retryOrDeadLetter(message, rawMessage, error);
    }
  }

  /**
   * Below the attempt cap: nack without requeue, which sends the message to
   * this queue's dead-letter exchange (the retry exchange) to wait out
   * `RETRY_DELAY_MS` before coming back. At the cap: publish it directly to
   * the permanent DLQ and ack, so it leaves the retry loop instead of
   * circling through it forever.
   */
  private async retryOrDeadLetter(
    message: EventEnvelope<MedicalQuestionAnswerSubmittedPayload>,
    rawMessage: ConsumeMessage,
    error: unknown,
  ): Promise<Nack | undefined> {
    const attempt = deliveryAttempt(rawMessage, QUEUE);
    this.logger.warn(
      `Failed to process ${message.eventName} (${message.eventId}), attempt ${attempt}/${MAX_DELIVERY_ATTEMPTS}`,
      error,
    );

    if (attempt < MAX_DELIVERY_ATTEMPTS) return new Nack(false);

    this.logger.error(
      `${message.eventName} (${message.eventId}) exhausted its retries; dead-lettering`,
    );
    await this.amqpConnection.publish(DEAD_LETTER_EXCHANGE, QUEUE, message, {
      persistent: true,
    });
    return undefined;
  }
}
