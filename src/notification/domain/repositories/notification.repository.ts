import {
  Notification,
  NotificationData,
} from 'src/notification/domain/entities/notification.model';
import { NotificationGroup } from 'src/notification/domain/enums/notification-group.enum';
import { NotificationType } from 'src/notification/domain/enums/notification-type.enum';

export interface CreateNotificationInput {
  userId: string;
  eventId: string;
  type: NotificationType;
  title: string;
  body: string;
  data: NotificationData;
}

export interface NotificationPage {
  items: Notification[];
  total: number;
}

export interface NotificationRepository {
  createIfNew(input: CreateNotificationInput): Promise<Notification | null>;

  listForUser(
    userId: string,
    page: number,
    limit: number,
  ): Promise<NotificationPage>;

  hasUnread(userId: string): Promise<boolean>;

  countUnread(userId: string): Promise<number>;

  markGroupRead(
    userId: string,
    group: NotificationGroup,
    startOfToday: Date,
  ): Promise<number>;

  isReminderDue(appointmentId: string, scheduledAt: Date): Promise<boolean>;
}

export const NOTIFICATION_REPOSITORY = Symbol('NOTIFICATION_REPOSITORY');
