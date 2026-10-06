import { DateTime } from 'luxon';
import { DEFAULT_TIMEZONE } from 'src/common/utils/clinic-time.util';
import { NotificationType } from 'src/notification/domain/enums/notification-type.enum';

import type { NotificationData } from 'src/notification/domain/entities/notification.model';
import type {
  AppointmentBookedPayload,
  AppointmentCancelledPayload,
  AppointmentReminderTriggeredPayload,
  FavouriteAddedPayload,
} from 'src/notification/notification.events';

export interface NotificationContent {
  type: NotificationType;
  title: string;
  body: string;
  data: NotificationData;
}

function cairoDateTime(iso: string): string {
  return DateTime.fromISO(iso)
    .setZone(DEFAULT_TIMEZONE)
    .toFormat("ccc d LLL 'at' h:mm a");
}

export function bookingConfirmedContent(
  payload: AppointmentBookedPayload,
): NotificationContent {
  return {
    type: NotificationType.BOOKING_CONFIRMED,
    title: 'Booking Confirmed',
    body: `Your appointment with ${payload.doctorName} at ${payload.clinicName} on ${cairoDateTime(payload.scheduledAt)} is confirmed.`,
    data: { appointmentId: payload.appointmentId },
  };
}

export function appointmentReminderContent(
  payload: AppointmentReminderTriggeredPayload,
): NotificationContent {
  return {
    type: NotificationType.APPOINTMENT_REMINDER,
    title: 'Appointment Reminder',
    body: `Don't forget your appointment with ${payload.doctorName} at ${payload.clinicName} on ${cairoDateTime(payload.scheduledAt)}.`,
    data: { appointmentId: payload.appointmentId },
  };
}

export function appointmentCancelledContent(
  payload: AppointmentCancelledPayload,
): NotificationContent {
  return {
    type: NotificationType.APPOINTMENT_CANCELLED,
    title: 'Appointment Cancelled',
    body: `Your appointment with ${payload.doctorName} on ${cairoDateTime(payload.scheduledAt)} has been cancelled.`,
    data: { appointmentId: payload.appointmentId },
  };
}

export function doctorFavoritedContent(
  payload: FavouriteAddedPayload,
): NotificationContent {
  return {
    type: NotificationType.DOCTOR_FAVORITED,
    title: 'Doctor Added to Favorites',
    body: `${payload.doctorName} has been added to your favorites.`,
    data: { doctorId: payload.doctorId },
  };
}
