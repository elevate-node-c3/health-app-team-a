import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

export const DOCTOR_PROFILE_VIEWED_EVENT = 'doctor.profile.viewed';

export interface DoctorProfileViewedEvent {
  doctorId: string;
  /** Signed-in user id, or null for a guest. */
  userId: string | null;
  at: Date;
}

/**
 * Handles the DoctorProfileViewed domain event for analytics / usage tracking.
 * Runs asynchronously (`async: true`) so it never adds latency to the profile
 * response. Errors are swallowed here — analytics must never fail a request.
 */
@Injectable()
export class DoctorAnalyticsListener {
  private readonly logger = new Logger(DoctorAnalyticsListener.name);

  @OnEvent(DOCTOR_PROFILE_VIEWED_EVENT, { async: true })
  handleDoctorProfileViewed(event: DoctorProfileViewedEvent): void {
    try {
      // Placeholder sink: replace with a real analytics/usage store when available.
      this.logger.log(
        `DoctorProfileViewed ${event.doctorId} by ${
          event.userId ?? 'guest'
        } at ${event.at.toISOString()}`,
      );
    } catch {
      // Never let analytics handling affect anything else.
    }
  }
}
