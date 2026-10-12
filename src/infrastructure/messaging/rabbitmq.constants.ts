import {
  APPOINTMENT_BOOKED_EVENT,
  APPOINTMENT_CANCELLED_EVENT,
  APPOINTMENT_REMINDER_TRIGGERED_EVENT,
  DOCTOR_PROFILE_VIEWED_EVENT,
  FAVOURITE_ADDED_EVENT,
  HOME_OPENED_EVENT,
  MAP_REGION_SEARCHED_EVENT,
  MEDICAL_QUESTION_ANSWER_SUBMITTED_EVENT,
} from './event-names';

export const EVENTS_EXCHANGE = 'health.events';

export const RETRY_EXCHANGE = 'health.events.retry';

export const DEAD_LETTER_EXCHANGE = 'health.events.dlx';

export const RETRY_DELAY_MS = 30_000;

export const MAX_DELIVERY_ATTEMPTS = 3;

export function consumerQueueName(consumer: string, eventName: string): string {
  return `${consumer}.${eventName}`;
}

export function retryQueueName(consumer: string, eventName: string): string {
  return `${consumerQueueName(consumer, eventName)}.retry`;
}

export function deadLetterQueueName(
  consumer: string,
  eventName: string,
): string {
  return `${consumerQueueName(consumer, eventName)}.dlq`;
}

export interface ReliableConsumerBinding {
  consumer: string;
  eventName: string;
}

export const RELIABLE_CONSUMERS: readonly ReliableConsumerBinding[] = [
  { consumer: 'email', eventName: APPOINTMENT_BOOKED_EVENT },
  {
    consumer: 'medical-question',
    eventName: MEDICAL_QUESTION_ANSWER_SUBMITTED_EVENT,
  },
  { consumer: 'notification', eventName: APPOINTMENT_BOOKED_EVENT },
  { consumer: 'notification', eventName: APPOINTMENT_CANCELLED_EVENT },
  { consumer: 'notification', eventName: APPOINTMENT_REMINDER_TRIGGERED_EVENT },
  { consumer: 'notification', eventName: FAVOURITE_ADDED_EVENT },
];

export const ANALYTICS_CONSUMERS: readonly ReliableConsumerBinding[] = [
  { consumer: 'analytics', eventName: DOCTOR_PROFILE_VIEWED_EVENT },
  { consumer: 'analytics', eventName: HOME_OPENED_EVENT },
  { consumer: 'analytics', eventName: MAP_REGION_SEARCHED_EVENT },
];
