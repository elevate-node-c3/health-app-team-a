import { ackErrorHandler, RabbitSubscribe } from '@golevelup/nestjs-rabbitmq';
import { Injectable, Logger } from '@nestjs/common';
import { MAP_REGION_SEARCHED_EVENT } from 'src/infrastructure/messaging/event-names';
import {
  ANALYTICS_CONSUMERS,
  EVENTS_EXCHANGE,
  consumerQueueName,
} from 'src/infrastructure/messaging/rabbitmq.constants';

import type { EventEnvelope } from 'src/infrastructure/messaging/event-publisher.port';

const CONSUMER = ANALYTICS_CONSUMERS.find(
  (binding) => binding.eventName === MAP_REGION_SEARCHED_EVENT,
)!.consumer;

/** Bounds a map query was scoped to (the map's visible region). */
export interface MapRegionBounds {
  neLat: number;
  neLng: number;
  swLat: number;
  swLng: number;
}

export interface MapRegionSearchedEvent {
  /** Signed-in user id, or null for a guest. */
  userId: string | null;
  /** Stable key for the device performing the search. */
  deviceId: string;
  bounds: MapRegionBounds;
  /** Whether the user shared a location (i.e. distances were computed). */
  hasLocation: boolean;
  /** How many results were returned (after the cap). */
  resultCount: number;
  /** Total matches within the region+filters, before the cap. */
  total: number;
  /** ISO instant — every event payload carries dates as strings on the wire. */
  at: string;
}

/**
 * Handles the MapRegionSearched domain event for analytics / geographic-search
 * tracking. Mirrors `HomeAnalyticsListener`.
 *
 * Lossy tier: `errorHandler: ackErrorHandler` acks on any failure instead of
 * retrying or dead-lettering, so a broken analytics sink can never block this
 * queue or pile messages into a DLQ nobody needs to triage.
 */
@Injectable()
export class MapSearchAnalyticsListener {
  private readonly logger = new Logger(MapSearchAnalyticsListener.name);

  @RabbitSubscribe({
    exchange: EVENTS_EXCHANGE,
    routingKey: MAP_REGION_SEARCHED_EVENT,
    queue: consumerQueueName(CONSUMER, MAP_REGION_SEARCHED_EVENT),
    queueOptions: { durable: true },
    errorHandler: ackErrorHandler,
  })
  handleMapRegionSearched(
    message: EventEnvelope<MapRegionSearchedEvent>,
  ): void {
    // Placeholder sink: replace with a real analytics/usage store when available.
    const event = message.payload;
    this.logger.log(
      `MapRegionSearched by ${event.userId ?? 'guest'} — ${event.resultCount}/${event.total} results, ` +
        `location=${event.hasLocation ? 'yes' : 'no'}, at ${event.at}`,
    );
  }
}
