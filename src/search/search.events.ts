import { EventEmitter } from 'events';

import { Inject, Injectable } from '@nestjs/common';

import { SEARCH_HISTORY_REPOSITORY } from './domain/repositories/search-history.repository';

import type { SearchHistoryRepository } from './domain/repositories/search-history.repository';

export interface SearchPerformedEvent {
  ownerKey: string;
  query: string;
  normalizedQuery: string;
}

export const SearchServiceConstants = {
  historyLimit: 10,
  resultLimit: 10,
} as const;

export const SEARCH_PERFORMED_EVENT = 'search.performed';

@Injectable()
export class SearchEventPublisher {
  private readonly emitter = new EventEmitter();

  constructor(
    @Inject(SEARCH_HISTORY_REPOSITORY)
    private readonly historyRepository: SearchHistoryRepository,
  ) {
    this.emitter.on(SEARCH_PERFORMED_EVENT, (event: SearchPerformedEvent) => {
      void this.historyRepository
        .remember(
          event.ownerKey,
          event.query,
          event.normalizedQuery,
          SearchServiceConstants.historyLimit,
        )
        .catch(() => undefined);
    });
  }

  publish(event: SearchPerformedEvent): void {
    this.emitter.emit(SEARCH_PERFORMED_EVENT, event);
  }
}
