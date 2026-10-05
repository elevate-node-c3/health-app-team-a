import {
  AmqpConnection,
  Nack,
  RabbitSubscribe,
} from '@golevelup/nestjs-rabbitmq';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { USER_REPOSITORY } from 'src/auth/domain/repositories/user.repository';
import { deliveryAttempt } from 'src/infrastructure/messaging/delivery-attempt.util';
import { PROCESSED_EVENT_REPOSITORY } from 'src/infrastructure/messaging/processed-event.repository';
import {
  DEAD_LETTER_EXCHANGE,
  EVENTS_EXCHANGE,
  MAX_DELIVERY_ATTEMPTS,
  RETRY_EXCHANGE,
  consumerQueueName,
} from 'src/infrastructure/messaging/rabbitmq.constants';

import { MailService } from './mail.service';

import type { ConsumeMessage } from 'amqplib';
import type { UserRepository } from 'src/auth/domain/repositories/user.repository';
import type { EventEnvelope } from 'src/infrastructure/messaging/event-publisher.port';
import type { ProcessedEventRepository } from 'src/infrastructure/messaging/processed-event.repository';

import { APPOINTMENT_BOOKED_EVENT } from '@/payment-method/payment.events';

interface AppointmentBookedPayload {
  userId: string;
  appointmentId: string;
  scheduledAt: string;
  doctorName: string;
  clinicName: string;
}

const CONSUMER_NAME = 'email';
const QUEUE = consumerQueueName(CONSUMER_NAME, APPOINTMENT_BOOKED_EVENT);

@Injectable()
export class BookingConfirmationEmailListener {
  private readonly logger = new Logger(BookingConfirmationEmailListener.name);

  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserRepository,
    @Inject(PROCESSED_EVENT_REPOSITORY)
    private readonly processedEvents: ProcessedEventRepository,
    private readonly mailService: MailService,
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
    routingKey: APPOINTMENT_BOOKED_EVENT,
    queue: QUEUE,
    queueOptions: {
      durable: true,
      deadLetterExchange: RETRY_EXCHANGE,
      deadLetterRoutingKey: QUEUE,
    },
  })
  async handleAppointmentBooked(
    message: EventEnvelope<AppointmentBookedPayload>,
    rawMessage: ConsumeMessage,
  ): Promise<Nack | undefined> {
    // Claimed before any side effect: a redelivery of an event this handler
    // already completed - whether from the broker's at-least-once guarantee
    // or from the outbox republishing after a crash - finds the claim already
    // taken and acks here without sending a second email.
    const claimed = await this.processedEvents.tryClaim(
      message.eventId,
      BookingConfirmationEmailListener.name,
    );
    if (!claimed) return undefined;

    try {
      await this.sendConfirmation(message.payload);
      return undefined;
    } catch (error) {
      // The side effect did not happen, so the claim must not stand — a
      // genuine retry needs to be able to claim again.
      await this.processedEvents.release(
        message.eventId,
        BookingConfirmationEmailListener.name,
      );
      return this.retryOrDeadLetter(message, rawMessage, error);
    }
  }

  private async sendConfirmation(
    payload: AppointmentBookedPayload,
  ): Promise<void> {
    const user = await this.userRepository.findById(payload.userId);
    if (!user)
      throw new Error(`Booking email recipient ${payload.userId} not found`);

    const scheduledAt = new Date(payload.scheduledAt);
    if (!Number.isFinite(scheduledAt.getTime()))
      throw new Error(`Invalid appointment time for ${payload.appointmentId}`);

    await this.mailService.sendBookingConfirmation(user.email, {
      appointmentId: payload.appointmentId,
      scheduledAt,
      doctorName: payload.doctorName,
      clinicName: payload.clinicName,
    });
  }

  /**
   * Below the attempt cap: nack without requeue, which sends the message to
   * this queue's dead-letter exchange (the retry exchange) to wait out
   * `RETRY_DELAY_MS` before coming back. At the cap: publish it directly to
   * the permanent DLQ and ack, so it leaves the retry loop instead of
   * circling through it forever.
   */
  private async retryOrDeadLetter(
    message: EventEnvelope<AppointmentBookedPayload>,
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
