import { ackErrorHandler, RabbitSubscribe } from '@golevelup/nestjs-rabbitmq';
import { Injectable, MessageEvent } from '@nestjs/common';
import { Observable, Subscriber } from 'rxjs';
import { NOTIFICATION_CREATED_EVENT } from 'src/infrastructure/messaging/event-names';
import { EVENTS_EXCHANGE } from 'src/infrastructure/messaging/rabbitmq.constants';

import type { NotificationCreatedEvent } from './notification.events';
import type { EventEnvelope } from 'src/infrastructure/messaging/event-publisher.port';

@Injectable()
export class NotificationStreamService {
  private readonly connections = new Map<
    string,
    Set<Subscriber<MessageEvent>>
  >();

  connect(userId: string): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      const userConnections = this.connections.get(userId) ?? new Set();
      userConnections.add(subscriber);
      this.connections.set(userId, userConnections);

      return () => {
        userConnections.delete(subscriber);
        if (userConnections.size === 0) this.connections.delete(userId);
      };
    });
  }

  @RabbitSubscribe({
    exchange: EVENTS_EXCHANGE,
    routingKey: NOTIFICATION_CREATED_EVENT,
    queueOptions: { exclusive: true, autoDelete: true, durable: false },
    errorHandler: ackErrorHandler,
  })
  handleNotificationCreated(
    message: EventEnvelope<NotificationCreatedEvent>,
  ): void {
    const userConnections = this.connections.get(message.payload.userId);
    userConnections?.forEach((subscriber) =>
      subscriber.next({ type: 'notification', data: message.payload }),
    );
  }
}
