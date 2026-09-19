import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

export const HOME_OPENED_EVENT = 'home.opened';

export interface HomeOpenedEvent {
  /** Signed-in user id, or null for a guest. */
  userId: string | null;
  at: Date;
}

/**
 * Handles the HomeOpened domain event for analytics / usage tracking. Runs
 * asynchronously (`async: true`) so it never adds latency to the Home response.
 * Errors are swallowed here — analytics must never fail a Home request.
 */
@Injectable()
export class HomeAnalyticsListener {
  private readonly logger = new Logger(HomeAnalyticsListener.name);

  @OnEvent(HOME_OPENED_EVENT, { async: true })
  handleHomeOpened(event: HomeOpenedEvent): void {
    try {
      // Placeholder sink: replace with a real analytics/usage store when available.
      this.logger.log(
        `HomeOpened by ${event.userId ?? 'guest'} at ${event.at.toISOString()}`,
      );
    } catch {
      // Never let analytics handling affect anything else.
    }
  }
}
