import { SearchResult } from 'src/search/domain/entities/search-result.model';

export interface SearchRepository {
  search(query: string, limit: number): Promise<SearchResult[]>;
}

export const SEARCH_REPOSITORY = Symbol('SEARCH_REPOSITORY');
