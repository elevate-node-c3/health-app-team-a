import { Gender } from 'src/auth/domain/enums/user.enum';
import { DoctorTitle } from 'src/doctor/domain/enums/doctor-title.enum';
import { PlaceType } from 'src/doctor/domain/enums/place-type.enum';
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

export interface SearchRepository {
  search(query: string, limit: number): Promise<SearchResult[]>;
  searchWithFilters(filters: SearchFilter): Promise<SearchResult[]>;
}

export const SEARCH_REPOSITORY = Symbol('SEARCH_REPOSITORY');
