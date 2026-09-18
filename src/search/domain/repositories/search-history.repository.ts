export interface SearchHistoryEntry {
  term: string;
  createdAt: Date;
}

export interface SearchHistoryRepository {
  findRecent(ownerKey: string, limit: number): Promise<SearchHistoryEntry[]>;
  remember(
    ownerKey: string,
    term: string,
    normalizedTerm: string,
    limit: number,
  ): Promise<void>;
  clear(ownerKey: string): Promise<void>;
  merge(
    deviceOwnerKey: string,
    userOwnerKey: string,
    limit: number,
  ): Promise<void>;
}

export const SEARCH_HISTORY_REPOSITORY = Symbol('SEARCH_HISTORY_REPOSITORY');
