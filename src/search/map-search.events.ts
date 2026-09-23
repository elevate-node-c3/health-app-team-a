import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

export const MAP_REGION_SEARCHED_EVENT = 'map.region.searched';

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
  at: Date;
}

/**
 * Handles the MapRegionSearched domain event for analytics / geographic-search
 * tracking. Runs asynchronously (`async: true`) so it never delays the map
 * search response, and swallows its own errors so analytics can never fail a
 * search. Mirrors the HomeAnalyticsListener pattern.
 */
@Injectable()
export class MapSearchAnalyticsListener {
  private readonly logger = new Logger(MapSearchAnalyticsListener.name);

  @OnEvent(MAP_REGION_SEARCHED_EVENT, { async: true })
  handleMapRegionSearched(event: MapRegionSearchedEvent): void {
    try {
      // Placeholder sink: replace with a real analytics/usage store when available.
      this.logger.log(
        `MapRegionSearched by ${event.userId ?? 'guest'} — ${event.resultCount}/${event.total} results, ` +
          `location=${event.hasLocation ? 'yes' : 'no'}, at ${event.at.toISOString()}`,
      );
    } catch {
      // Never let analytics handling affect the map search.
    }
  }
}
