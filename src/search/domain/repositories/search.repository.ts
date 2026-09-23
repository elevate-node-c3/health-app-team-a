import { Gender } from 'src/auth/domain/enums/user.enum';
import { DoctorTitle } from 'src/doctor/domain/enums/doctor-title.enum';
import { PlaceType } from 'src/doctor/domain/enums/place-type.enum';
import { MapClinicResult } from 'src/search/domain/entities/map-clinic-result.model';
import { SearchResult } from 'src/search/domain/entities/search-result.model';

export interface SearchFilter {
  query?: string;
  genders?: Gender[];
  availability?: string[];
  places?: PlaceType[];
  titles?: DoctorTitle[];
  governorate?: string;
  city?: string;
  specialty?: string;
  minPrice?: number;
  maxPrice?: number;
  rating?: number;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'ASC' | 'DESC';
}

/** Map bounds (south-west + north-east corners) and optional user location. */
export interface MapBounds {
  neLat: number;
  neLng: number;
  swLat: number;
  swLng: number;
  userLat?: number;
  userLng?: number;
}

/**
 * Map View filter: the same non-geographic filters as the list search, scoped
 * by map bounds instead of a text region. `limit` caps the number of returned
 * rows.
 */
export interface MapSearchFilter extends MapBounds {
  query?: string;
  genders?: Gender[];
  availability?: string[];
  places?: PlaceType[];
  titles?: DoctorTitle[];
  specialty?: string;
  minPrice?: number;
  maxPrice?: number;
  rating?: number;
  limit: number;
}

export interface SearchRepository {
  search(query: string, limit: number): Promise<SearchResult[]>;
  searchWithFilters(filters: SearchFilter): Promise<SearchResult[]>;
  searchMap(
    filters: MapSearchFilter,
  ): Promise<{ rows: MapClinicResult[]; total: number }>;
}

export const SEARCH_REPOSITORY = Symbol('SEARCH_REPOSITORY');
