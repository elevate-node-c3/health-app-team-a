import type { NotificationData } from './domain/entities/notification.model';
import type { NotificationType } from './domain/enums/notification-type.enum';

export interface AppointmentBookedPayload {
  userId: string;
  appointmentId: string;
  scheduledAt: string;
  doctorName: string;
  clinicName: string;
}

export interface AppointmentCancelledPayload {
  userId: string;
  appointmentId: string;
  scheduledAt: string;
  doctorName: string;
}

export interface AppointmentReminderTriggeredPayload {
  userId: string;
  appointmentId: string;
  scheduledAt: string;
  doctorName: string;
  clinicName: string;
}

export interface FavouriteAddedPayload {
  userId: string;
  doctorId: string;
  doctorName: string;
}

export interface NotificationCreatedEvent {
  notificationId: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  data: NotificationData;
  createdAt: string;
}
