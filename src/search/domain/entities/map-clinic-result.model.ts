import { DoctorTitle } from 'src/doctor/domain/enums/doctor-title.enum';
import { PlaceType } from 'src/doctor/domain/enums/place-type.enum';

/**
 * A single Map View row: one doctor practising at one clinic ("card per
 * doctor-clinic"). Rows sharing a `clinicId` share one map pin. `distanceMeters`
 * is null when the user location is unknown/invalid — never a fabricated value.
 */
export class MapClinicResult {
  constructor(
    public readonly doctorClinicId: string,
    public readonly clinicId: string,
    public readonly clinicName: string,
    public readonly placeType: PlaceType,
    public readonly governorate: string,
    public readonly city: string,
    public readonly latitude: number,
    public readonly longitude: number,
    public readonly doctorId: string,
    public readonly doctorName: string,
    public readonly doctorPhoto: string | null,
    public readonly title: DoctorTitle,
    public readonly specialtyName: string,
    public readonly ratingAverage: number,
    public readonly ratingCount: number,
    public readonly fee: number,
    public readonly distanceMeters: number | null,
  ) {}
}
