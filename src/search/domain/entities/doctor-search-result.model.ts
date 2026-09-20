export type DoctorSearchSort = 'recommended' | 'price_asc' | 'price_desc';

export interface DoctorSearchResult {
  id: string;
  name: string;
  specialty: string;
  rating: number;
  consultationFee: number;
  recommendationScore: number;
}

export interface DoctorSearchPage {
  query: string;
  sort: DoctorSearchSort;
  results: DoctorSearchResult[];
  nextCursor: string | null;
  hasMore: boolean;
}
