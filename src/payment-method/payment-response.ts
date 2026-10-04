import type { AppointmentReceipt } from 'src/appointment/domain/repositories/appointment.repository';

/**
 * The three shapes a payment confirmation can return.
 *
 * Pure builders, shared by the charge, refund and status paths so a caller
 * cannot invent a fourth wording for an outcome the client already handles.
 * The client branches on `status`, so these strings are API surface.
 */

const CONFIRMATION_FAILED_MESSAGE =
  "Payment Failed, We couldn't process your payment. Please check your card details";

/** How long before the appointment the patient is asked to arrive. */
const ARRIVE_EARLY_MS = 15 * 60_000;

export function failedPaymentResponse(): Record<string, unknown> {
  return {
    status: 'failed',
    paymentStatus: 'failed',
    message: CONFIRMATION_FAILED_MESSAGE,
    action: 'CHECK_CARD_DETAILS',
  };
}

/**
 * Returned whenever the provider outcome is not yet known — including after a
 * failure the reconciliation loop will retry. `retryWithSameKey` tells the
 * client to poll rather than charge again.
 */
export function processingPaymentResponse(): Record<string, unknown> {
  return {
    status: 'processing',
    paymentStatus: 'processing',
    message:
      'Payment is still being confirmed. Your appointment time is being held. Do not pay again; check this payment using the same request key.',
    retryWithSameKey: true,
  };
}

export function confirmedPaymentResponse(
  appointment: AppointmentReceipt,
): Record<string, unknown> {
  const { doctorName } = appointment;
  const formattedTime = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(appointment.scheduledAt);

  return {
    status: 'confirmed',
    paymentStatus: 'succeeded',
    appointmentId: appointment.id,
    scheduledAt: appointment.scheduledAt,
    doctorName,
    clinicName: appointment.clinicName,
    arriveAt: new Date(appointment.scheduledAt.getTime() - ARRIVE_EARLY_MS),
    message: `Your appointment has been booked successfully. On ${formattedTime} with Dr. ${doctorName}. We will remind you. Please arrive 15 minutes before the appointment.`,
  };
}
