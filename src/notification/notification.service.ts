import { Inject, Injectable, MessageEvent } from '@nestjs/common';
import { DateTime } from 'luxon';
import { Observable } from 'rxjs';
import { DEFAULT_TIMEZONE } from 'src/common/utils/clinic-time.util';
import { paginate, Paginated } from 'src/common/utils/pagination.util';
import { NOTIFICATION_CREATED_EVENT } from 'src/infrastructure/messaging/event-names';
import { EVENT_PUBLISHER } from 'src/infrastructure/messaging/event-publisher.port';

import {
  Notification,
  NotificationData,
} from './domain/entities/notification.model';
import { NotificationGroup } from './domain/enums/notification-group.enum';
import { NotificationType } from './domain/enums/notification-type.enum';
import { NOTIFICATION_REPOSITORY } from './domain/repositories/notification.repository';
import { NotificationStreamService } from './notification-stream.service';

import type { NotificationContent } from './domain/entities/notification-content';
import type { NotificationRepository } from './domain/repositories/notification.repository';
import type { NotificationCreatedEvent } from './notification.events';
import type { EventPublisher } from 'src/infrastructure/messaging/event-publisher.port';

export interface NotificationResponse {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  data: NotificationData;
  isRead: boolean;
  group: NotificationGroup;
  createdAt: Date;
}

export interface NotificationListResponse extends Paginated<NotificationResponse> {
  groupBoundary: Date;
}

export interface UnreadResponse {
  hasUnread: boolean;
  count: number;
}

export interface MarkReadResponse {
  group: NotificationGroup;
  markedRead: number;
}

@Injectable()
export class NotificationService {
  constructor(
    @Inject(NOTIFICATION_REPOSITORY)
    private readonly notificationRepository: NotificationRepository,
    @Inject(EVENT_PUBLISHER)
    private readonly events: EventPublisher,
    private readonly stream: NotificationStreamService,
  ) {}

  async createFromEvent(
    userId: string,
    eventId: string,
    content: NotificationContent,
  ): Promise<void> {
    const notification = await this.notificationRepository.createIfNew({
      userId,
      eventId,
      ...content,
    });
    if (!notification) return;

    this.events.emit(NOTIFICATION_CREATED_EVENT, {
      notificationId: notification.id,
      userId: notification.userId,
      type: notification.type,
      title: notification.title,
      body: notification.body,
      data: notification.data,
      createdAt: notification.createdAt.toISOString(),
    } satisfies NotificationCreatedEvent);
  }

  async isReminderDue(
    appointmentId: string,
    scheduledAt: Date,
  ): Promise<boolean> {
    return this.notificationRepository.isReminderDue(
      appointmentId,
      scheduledAt,
    );
  }

  async list(
    userId: string,
    page: number,
    limit: number,
    now: Date = new Date(),
  ): Promise<NotificationListResponse> {
    const { items, total } = await this.notificationRepository.listForUser(
      userId,
      page,
      limit,
    );
    const startOfToday = this.startOfToday(now);

    return {
      ...paginate(
        items.map((notification) =>
          this.toResponse(notification, startOfToday),
        ),
        total,
        page,
        limit,
      ),
      groupBoundary: startOfToday,
    };
  }

  async unread(userId: string): Promise<UnreadResponse> {
    const count = await this.notificationRepository.countUnread(userId);
    return { hasUnread: count > 0, count };
  }

  async markGroupRead(
    userId: string,
    group: NotificationGroup,
    groupBoundary: Date,
  ): Promise<MarkReadResponse> {
    const markedRead = await this.notificationRepository.markGroupRead(
      userId,
      group,
      groupBoundary,
    );
    return { group, markedRead };
  }

  connect(userId: string): Observable<MessageEvent> {
    return this.stream.connect(userId);
  }

  private startOfToday(now: Date): Date {
    return DateTime.fromJSDate(now)
      .setZone(DEFAULT_TIMEZONE)
      .startOf('day')
      .toJSDate();
  }

  private toResponse(
    notification: Notification,
    startOfToday: Date,
  ): NotificationResponse {
    return {
      id: notification.id,
      type: notification.type,
      title: notification.title,
      body: notification.body,
      data: notification.data,
      isRead: notification.isRead,
      group: notification.groupFor(startOfToday),
      createdAt: notification.createdAt,
    };
  }
}
