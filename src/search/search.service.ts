import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { MapClinicResult } from './domain/entities/map-clinic-result.model';
import { SearchResult } from './domain/entities/search-result.model';
import { SEARCH_HISTORY_REPOSITORY } from './domain/repositories/search-history.repository';
import { SEARCH_REPOSITORY } from './domain/repositories/search.repository';
import { MapSearchQueryDto } from './dto/map-search-query.dto';
import { MAP_SEARCH_MAX_RESULTS } from './map-search.constants';
import {
  MAP_REGION_SEARCHED_EVENT,
  MapRegionSearchedEvent,
} from './map-search.events';
import { MapSearchItem, MapSearchResponse } from './map-search.types';
import { SearchEventPublisher, SearchServiceConstants } from './search.events';

import type { SearchHistoryRepository } from './domain/repositories/search-history.repository';
import type {
  SearchFilter,
  SearchRepository,
} from './domain/repositories/search.repository';

export interface SearchIdentity {
  deviceId: string;
  userId?: string;
}

@Injectable()
export class SearchService {
  constructor(
    @Inject(SEARCH_REPOSITORY)
    private readonly searchRepository: SearchRepository,
    @Inject(SEARCH_HISTORY_REPOSITORY)
    private readonly historyRepository: SearchHistoryRepository,
    private readonly eventPublisher: SearchEventPublisher,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async suggestions(query: string): Promise<SearchResult[]> {
    return this.searchRepository.search(
      this.normalize(query),
      SearchServiceConstants.resultLimit,
    );
  }

  async search(dto: SearchFilter, identity: SearchIdentity) {
    const normalizedQuery = dto.query ? this.normalize(dto.query) : undefined;
    const ownerKey = await this.prepareOwner(identity);

    const hasFilters = Object.keys(dto).some(
      (k) => k !== 'query' && (dto as Record<string, unknown>)[k] !== undefined,
    );

    let results: SearchResult[];
    if (hasFilters) {
      results = await this.searchRepository.searchWithFilters({
        ...dto,
        query: normalizedQuery,
      });
    } else {
      results = await this.searchRepository.search(
        normalizedQuery || '',
        SearchServiceConstants.resultLimit,
      );
    }

    this.eventPublisher.publish({
      ownerKey,
      query: normalizedQuery || '',
      normalizedQuery: normalizedQuery ? normalizedQuery.toLowerCase() : '',
      // Can add more event details here as requested (e.g., filters applied)
    });

    return { query: normalizedQuery, results };
  }

  /**
   * Map View: the same filtered search rendered as clinic pins, scoped to the
   * map's visible bounds (not the original text region). Distances are computed
   * server-side only when the user shares a location. Results are capped and
   * ranked; a `MapRegionSearched` analytics event is emitted asynchronously.
   */
  async searchMap(
    dto: MapSearchQueryDto,
    identity: SearchIdentity,
  ): Promise<MapSearchResponse> {
    const normalizedQuery = dto.query ? this.normalize(dto.query) : undefined;
    const hasLocation = dto.userLat !== undefined && dto.userLng !== undefined;

    const { rows, total } = await this.searchRepository.searchMap({
      query: normalizedQuery,
      genders: dto.genders,
      availability: dto.availability,
      places: dto.places,
      titles: dto.titles,
      specialty: dto.specialty,
      minPrice: dto.minPrice,
      maxPrice: dto.maxPrice,
      rating: dto.rating,
      neLat: dto.neLat,
      neLng: dto.neLng,
      swLat: dto.swLat,
      swLng: dto.swLng,
      userLat: dto.userLat,
      userLng: dto.userLng,
      limit: MAP_SEARCH_MAX_RESULTS,
    });

    // Fire-and-forget analytics — the listener runs asynchronously and never
    // delays the response.
    this.eventEmitter.emit(MAP_REGION_SEARCHED_EVENT, {
      userId: identity.userId ?? null,
      deviceId: identity.deviceId,
      bounds: {
        neLat: dto.neLat,
        neLng: dto.neLng,
        swLat: dto.swLat,
        swLng: dto.swLng,
      },
      hasLocation,
      resultCount: rows.length,
      total,
      at: new Date(),
    } satisfies MapRegionSearchedEvent);

    return {
      data: rows.map((row) => this.toMapItem(row)),
      meta: {
        limit: MAP_SEARCH_MAX_RESULTS,
        returned: rows.length,
        total,
        limited: total > rows.length,
        hasDistance: hasLocation,
      },
    };
  }

  async history(identity: SearchIdentity): Promise<string[]> {
    const ownerKey = await this.prepareOwner(identity);
    const entries = await this.historyRepository.findRecent(
      ownerKey,
      SearchServiceConstants.historyLimit,
    );
    return entries.map((entry) => entry.term);
  }

  async clearHistory(identity: SearchIdentity): Promise<void> {
    const ownerKey = await this.prepareOwner(identity);
    await this.historyRepository.clear(ownerKey);
  }

  private async prepareOwner(identity: SearchIdentity): Promise<string> {
    const deviceOwnerKey = `device:${identity.deviceId}`;
    if (!identity.userId) return deviceOwnerKey;

    const userOwnerKey = `user:${identity.userId}`;
    await this.historyRepository.merge(
      deviceOwnerKey,
      userOwnerKey,
      SearchServiceConstants.historyLimit,
    );
    return userOwnerKey;
  }

  private toMapItem(row: MapClinicResult): MapSearchItem {
    return {
      doctorClinicId: row.doctorClinicId,
      clinic: {
        id: row.clinicId,
        name: row.clinicName,
        placeType: row.placeType,
        governorate: row.governorate,
        city: row.city,
        latitude: row.latitude,
        longitude: row.longitude,
      },
      doctor: {
        id: row.doctorId,
        name: row.doctorName,
        photo: row.doctorPhoto,
        title: row.title,
        specialty: row.specialtyName,
        rating:
          row.ratingCount > 0
            ? { average: row.ratingAverage, count: row.ratingCount }
            : null,
      },
      fee: row.fee,
      feeCurrency: 'EGP',
      distanceMeters: row.distanceMeters,
    };
  }

  private normalize(query: string): string {
    return query.trim().normalize('NFKC');
  }
}
