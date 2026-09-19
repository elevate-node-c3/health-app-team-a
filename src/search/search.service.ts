import { Inject, Injectable } from '@nestjs/common';

import { SearchResult } from './domain/entities/search-result.model';
import { SEARCH_HISTORY_REPOSITORY } from './domain/repositories/search-history.repository';
import { SEARCH_REPOSITORY } from './domain/repositories/search.repository';
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

  private normalize(query: string): string {
    return query.trim().normalize('NFKC');
  }
}
