import { jest } from '@jest/globals';
import { NOTIFICATION_CREATED_EVENT } from 'src/infrastructure/messaging/event-names';

import { Notification } from './domain/entities/notification.model';
import { NotificationGroup } from './domain/enums/notification-group.enum';
import { NotificationType } from './domain/enums/notification-type.enum';
import { NotificationService } from './notification.service';

import type { NotificationPage } from './domain/repositories/notification.repository';

function makeNotification(
  overrides: Partial<{ id: string; createdAt: Date; readAt: Date | null }> = {},
): Notification {
  return new Notification(
    overrides.id ?? 'notification-1',
    'user-1',
    'event-1',
    NotificationType.BOOKING_CONFIRMED,
    'Booking Confirmed',
    'Your appointment is confirmed.',
    { appointmentId: 'appointment-1' },
    overrides.readAt ?? null,
    overrides.createdAt ?? new Date('2026-10-06T08:00:00Z'),
  );
}

describe('NotificationService', () => {
  let notificationRepository: {
    createIfNew: jest.Mock;
    listForUser: jest.Mock;
    countUnread: jest.Mock;
    markGroupRead: jest.Mock;
    isAppointmentScheduled: jest.Mock;
  };
  let events: { emit: jest.Mock };
  let service: NotificationService;

  const now = new Date('2026-10-06T10:00:00Z');
  const startOfTodayCairo = new Date('2026-10-05T21:00:00Z');

  beforeEach(() => {
    notificationRepository = {
      createIfNew: jest.fn<() => Promise<Notification | null>>(),
      listForUser: jest.fn<() => Promise<NotificationPage>>(),
      countUnread: jest.fn<() => Promise<number>>(),
      markGroupRead: jest.fn<() => Promise<number>>(),
      isAppointmentScheduled: jest.fn<() => Promise<boolean>>(),
    };
    events = { emit: jest.fn() };

    service = new NotificationService(
      notificationRepository as never,
      events as never,
      {} as never,
    );
  });

  describe('createFromEvent', () => {
    const content = {
      type: NotificationType.BOOKING_CONFIRMED,
      title: 'Booking Confirmed',
      body: 'Your appointment is confirmed.',
      data: { appointmentId: 'appointment-1' },
    };

    it('saves the notification and publishes notification.created', async () => {
      notificationRepository.createIfNew.mockResolvedValue(makeNotification());

      await service.createFromEvent('user-1', 'event-1', content);

      expect(notificationRepository.createIfNew).toHaveBeenCalledWith({
        userId: 'user-1',
        eventId: 'event-1',
        ...content,
      });
      expect(events.emit).toHaveBeenCalledWith(
        NOTIFICATION_CREATED_EVENT,
        expect.objectContaining({
          notificationId: 'notification-1',
          userId: 'user-1',
          title: 'Booking Confirmed',
        }),
      );
    });

    it('publishes nothing when the event was already processed', async () => {
      notificationRepository.createIfNew.mockResolvedValue(null);

      await service.createFromEvent('user-1', 'event-1', content);

      expect(events.emit).not.toHaveBeenCalled();
    });
  });

  describe('list', () => {
    it('groups by start of today in Cairo, newest first, paginated', async () => {
      notificationRepository.listForUser.mockResolvedValue({
        items: [
          makeNotification({ id: 'today', createdAt: startOfTodayCairo }),
          makeNotification({
            id: 'yesterday',
            createdAt: new Date(startOfTodayCairo.getTime() - 1),
            readAt: now,
          }),
        ],
        total: 12,
      });

      const page = await service.list('user-1', 2, 10, now);

      expect(notificationRepository.listForUser).toHaveBeenCalledWith(
        'user-1',
        2,
        10,
      );
      expect(page.data.map((n) => [n.id, n.group, n.isRead])).toEqual([
        ['today', NotificationGroup.NEWEST, false],
        ['yesterday', NotificationGroup.OLD, true],
      ]);
      expect(page.meta).toMatchObject({ total: 12, page: 2, limit: 10 });
    });
  });

  describe('unread', () => {
    it('reports the unread count and whether there are any', async () => {
      notificationRepository.countUnread.mockResolvedValue(3);

      await expect(service.unread('user-1')).resolves.toEqual({
        hasUnread: true,
        count: 3,
      });
    });

    it('reports no unread when the count is zero', async () => {
      notificationRepository.countUnread.mockResolvedValue(0);

      await expect(service.unread('user-1')).resolves.toEqual({
        hasUnread: false,
        count: 0,
      });
    });
  });

  describe('markGroupRead', () => {
    it('marks only the requested group, using the Cairo day boundary', async () => {
      notificationRepository.markGroupRead.mockResolvedValue(4);

      const result = await service.markGroupRead(
        'user-1',
        NotificationGroup.NEWEST,
        now,
      );

      expect(notificationRepository.markGroupRead).toHaveBeenCalledWith(
        'user-1',
        NotificationGroup.NEWEST,
        startOfTodayCairo,
      );
      expect(result).toEqual({
        group: NotificationGroup.NEWEST,
        markedRead: 4,
      });
    });

    it('returns zero on a repeat call once everything is read', async () => {
      notificationRepository.markGroupRead.mockResolvedValue(0);

      const result = await service.markGroupRead(
        'user-1',
        NotificationGroup.OLD,
        now,
      );

      expect(result).toEqual({ group: NotificationGroup.OLD, markedRead: 0 });
    });
  });
});
