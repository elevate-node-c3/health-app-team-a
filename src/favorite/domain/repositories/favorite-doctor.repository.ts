import { FavoriteDoctor } from '../entitties/favorite-doctor.model';

import { FavoriteDoctorDTO } from '@/favorite/dto/favorite-doctor.dto';

export interface FavoriteDoctorRepo {
  addFavoriteDcotor(input: FavoriteDoctorDTO): Promise<FavoriteDoctor>;
  findFavoriteDoctors(userID: string): Promise<FavoriteDoctor[]>;
  removeFavoriteDoctor(doctorID: string): void;
}

export const FAVORIT_DOCTOR_REPOSITORY = Symbol('FAVORIT_DOCTOR_REPOSITORY');
