import { NotificationGroup } from 'src/notification/domain/enums/notification-group.enum';
import { NotificationType } from 'src/notification/domain/enums/notification-type.enum';

export type NotificationData = Record<string, string>;

export class Notification {
  constructor(
    public readonly id: string,
    public readonly userId: string,
    public readonly eventId: string,
    public readonly type: NotificationType,
    public readonly title: string,
    public readonly body: string,
    public readonly data: NotificationData,
    public readAt: Date | null,
    public readonly createdAt: Date,
  ) {}

  get isRead(): boolean {
    return this.readAt !== null;
  }

  groupFor(startOfToday: Date): NotificationGroup {
    return this.createdAt >= startOfToday
      ? NotificationGroup.NEWEST
      : NotificationGroup.OLD;
  }
}
