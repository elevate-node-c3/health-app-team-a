import { ackErrorHandler, RabbitSubscribe } from '@golevelup/nestjs-rabbitmq';
import { Injectable, Logger } from '@nestjs/common';
import { DOCTOR_PROFILE_VIEWED_EVENT } from 'src/infrastructure/messaging/event-names';
import {
  ANALYTICS_CONSUMERS,
  EVENTS_EXCHANGE,
  consumerQueueName,
} from 'src/infrastructure/messaging/rabbitmq.constants';

import type { EventEnvelope } from 'src/infrastructure/messaging/event-publisher.port';

const CONSUMER = ANALYTICS_CONSUMERS.find(
  (binding) => binding.eventName === DOCTOR_PROFILE_VIEWED_EVENT,
)!.consumer;

export interface DoctorProfileViewedEvent {
  doctorId: string;
  /** Signed-in user id, or null for a guest. */
  userId: string | null;
  /** ISO instant — every event payload carries dates as strings on the wire. */
  at: string;
}

/**
 * Handles the DoctorProfileViewed domain event for analytics / usage tracking.
 *
 * Lossy tier: `errorHandler: ackErrorHandler` acks on any failure instead of
 * retrying or dead-lettering, so a broken analytics sink can never block this
 * queue or pile messages into a DLQ nobody needs to triage.
 */
@Injectable()
export class DoctorAnalyticsListener {
  private readonly logger = new Logger(DoctorAnalyticsListener.name);

  @RabbitSubscribe({
    exchange: EVENTS_EXCHANGE,
    routingKey: DOCTOR_PROFILE_VIEWED_EVENT,
    queue: consumerQueueName(CONSUMER, DOCTOR_PROFILE_VIEWED_EVENT),
    queueOptions: { durable: true },
    errorHandler: ackErrorHandler,
  })
  handleDoctorProfileViewed(
    message: EventEnvelope<DoctorProfileViewedEvent>,
  ): void {
    // Placeholder sink: replace with a real analytics/usage store when available.
    const event = message.payload;
    this.logger.log(
      `DoctorProfileViewed ${event.doctorId} by ${event.userId ?? 'guest'} at ${event.at}`,
    );
  }
}
