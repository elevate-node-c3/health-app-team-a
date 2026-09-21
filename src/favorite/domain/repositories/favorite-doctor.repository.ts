import { FavoriteDoctor } from '../entitties/favorite-doctor.model';

export interface FavoriteDoctorRepo {
  addFavoriteDcotor(input: object): Promise<FavoriteDoctor>;
  findFavoriteDoctors(userID: string): Promise<FavoriteDoctor[]>;
  removeFavoriteDoctor(doctorID: string): void;
}

export const FAVORIT_DOCTOR_REPOSITORY = Symbol('FAVORIT_DOCTOR_REPOSITORY');
