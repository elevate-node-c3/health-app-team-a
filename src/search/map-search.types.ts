import { DoctorTitle } from 'src/doctor/domain/enums/doctor-title.enum';
import { PlaceType } from 'src/doctor/domain/enums/place-type.enum';

export interface MapClinicPin {
  id: string;
  name: string;
  placeType: PlaceType;
  governorate: string;
  city: string;
  latitude: number;
  longitude: number;
}

export interface MapDoctorCard {
  id: string;
  name: string;
  photo: string | null;
  title: DoctorTitle;
  specialty: string;
  rating: { average: number; count: number } | null;
}

/** One doctor-at-clinic result. Rows sharing `clinic.id` share one map pin. */
export interface MapSearchItem {
  doctorClinicId: string;
  clinic: MapClinicPin;
  doctor: MapDoctorCard;
  fee: number;
  feeCurrency: 'EGP';
  distanceMeters: number | null;
}

export interface MapSearchMeta {
  /** Maximum number of results can be returned */
  limit: number;
  /** How many results this response actually contains. */
  returned: number;
  /** Total matches can be found for the given query. */
  total: number;
  /** True when `total > returned`. */
  limited: boolean;
  /** True when distances were computed for the results. */
  hasDistance: boolean;
}

export interface MapSearchResponse {
  data: MapSearchItem[];
  meta: MapSearchMeta;
}
