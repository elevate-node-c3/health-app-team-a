import {
  AmqpConnection,
  Nack,
  RabbitSubscribe,
} from '@golevelup/nestjs-rabbitmq';
import { Injectable, Logger } from '@nestjs/common';
import { deliveryAttempt } from 'src/infrastructure/messaging/delivery-attempt.util';
import {
  APPOINTMENT_BOOKED_EVENT,
  APPOINTMENT_CANCELLED_EVENT,
  APPOINTMENT_REMINDER_TRIGGERED_EVENT,
  FAVOURITE_ADDED_EVENT,
} from 'src/infrastructure/messaging/event-names';
import {
  DEAD_LETTER_EXCHANGE,
  EVENTS_EXCHANGE,
  MAX_DELIVERY_ATTEMPTS,
  RETRY_EXCHANGE,
  consumerQueueName,
} from 'src/infrastructure/messaging/rabbitmq.constants';

import {
  appointmentCancelledContent,
  appointmentReminderContent,
  bookingConfirmedContent,
  doctorFavoritedContent,
} from './domain/entities/notification-content';
import { NotificationService } from './notification.service';

import type { NotificationContent } from './domain/entities/notification-content';
import type {
  AppointmentBookedPayload,
  AppointmentCancelledPayload,
  AppointmentReminderTriggeredPayload,
  FavouriteAddedPayload,
} from './notification.events';
import type { ConsumeMessage } from 'amqplib';
import type { EventEnvelope } from 'src/infrastructure/messaging/event-publisher.port';

const CONSUMER_NAME = 'notification';

function reliableSubscription(eventName: string) {
  const queue = consumerQueueName(CONSUMER_NAME, eventName);
  return {
    exchange: EVENTS_EXCHANGE,
    routingKey: eventName,
    queue,
    queueOptions: {
      durable: true,
      deadLetterExchange: RETRY_EXCHANGE,
      deadLetterRoutingKey: queue,
    },
  };
}

@Injectable()
export class NotificationListener {
  private readonly logger = new Logger(NotificationListener.name);

  constructor(
    private readonly notificationService: NotificationService,
    private readonly amqpConnection: AmqpConnection,
  ) {}

  @RabbitSubscribe(reliableSubscription(APPOINTMENT_BOOKED_EVENT))
  async handleAppointmentBooked(
    message: EventEnvelope<AppointmentBookedPayload>,
    rawMessage: ConsumeMessage,
  ): Promise<Nack | undefined> {
    return this.process(message, rawMessage, (payload) =>
      Promise.resolve(bookingConfirmedContent(payload)),
    );
  }

  @RabbitSubscribe(reliableSubscription(APPOINTMENT_CANCELLED_EVENT))
  async handleAppointmentCancelled(
    message: EventEnvelope<AppointmentCancelledPayload>,
    rawMessage: ConsumeMessage,
  ): Promise<Nack | undefined> {
    return this.process(message, rawMessage, (payload) =>
      Promise.resolve(appointmentCancelledContent(payload)),
    );
  }

  @RabbitSubscribe(reliableSubscription(APPOINTMENT_REMINDER_TRIGGERED_EVENT))
  async handleAppointmentReminder(
    message: EventEnvelope<AppointmentReminderTriggeredPayload>,
    rawMessage: ConsumeMessage,
  ): Promise<Nack | undefined> {
    return this.process(message, rawMessage, async (payload) =>
      (await this.notificationService.isReminderDue(
        payload.appointmentId,
        new Date(payload.scheduledAt),
      ))
        ? appointmentReminderContent(payload)
        : null,
    );
  }

  @RabbitSubscribe(reliableSubscription(FAVOURITE_ADDED_EVENT))
  async handleFavouriteAdded(
    message: EventEnvelope<FavouriteAddedPayload>,
    rawMessage: ConsumeMessage,
  ): Promise<Nack | undefined> {
    return this.process(message, rawMessage, (payload) =>
      Promise.resolve(doctorFavoritedContent(payload)),
    );
  }

  private async process<TPayload extends { userId: string }>(
    message: EventEnvelope<TPayload>,
    rawMessage: ConsumeMessage,
    buildContent: (payload: TPayload) => Promise<NotificationContent | null>,
  ): Promise<Nack | undefined> {
    try {
      const content = await buildContent(message.payload);
      if (content)
        await this.notificationService.createFromEvent(
          message.payload.userId,
          message.eventId,
          content,
        );
      return undefined;
    } catch (error) {
      return this.retryOrDeadLetter(message, rawMessage, error);
    }
  }

  private async retryOrDeadLetter(
    message: EventEnvelope<unknown>,
    rawMessage: ConsumeMessage,
    error: unknown,
  ): Promise<Nack | undefined> {
    const queue = consumerQueueName(CONSUMER_NAME, message.eventName);
    const attempt = deliveryAttempt(rawMessage, queue);
    this.logger.warn(
      `Failed to process ${message.eventName} (${message.eventId}), attempt ${attempt}/${MAX_DELIVERY_ATTEMPTS}`,
      error,
    );

    if (attempt < MAX_DELIVERY_ATTEMPTS) return new Nack(false);

    this.logger.error(
      `${message.eventName} (${message.eventId}) exhausted its retries; dead-lettering`,
    );
    await this.amqpConnection.publish(DEAD_LETTER_EXCHANGE, queue, message, {
      persistent: true,
    });
    return undefined;
  }
}
