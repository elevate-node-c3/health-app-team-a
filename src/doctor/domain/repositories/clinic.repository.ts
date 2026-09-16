import { Clinic } from 'src/doctor/domain/entities/clinic.model';
import { PlaceType } from 'src/doctor/domain/enums/place-type.enum';

export interface CreateClinicInput {
  name: string;
  placeType: PlaceType;
  governorate: string;
  city: string;
  latitude: number;
  longitude: number;
}

export interface ClinicRepository {
  findById(id: string): Promise<Clinic | null>;
  create(input: CreateClinicInput): Promise<Clinic>;
}

export const CLINIC_REPOSITORY = Symbol('CLINIC_REPOSITORY');
