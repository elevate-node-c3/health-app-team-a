import { NotFoundException } from '@nestjs/common';

import { FavoriteDoctor } from './domain/entitties/favorite-doctor.model';
import { FavoriteDoctorRepo } from './domain/repositories/favorite-doctor.repository';

export class FavoriteService {
  constructor(private readonly favoriteRepo: FavoriteDoctorRepo) {}
  async addFavoritDoctor(
    userID: string,
    doctorID: string,
  ): Promise<FavoriteDoctor | undefined> {
    if (!userID || !doctorID)
      throw new NotFoundException({ message: 'User or Doctor Not Found' });
    const favoriteDoctors = await this.favoriteRepo.findFavoriteDoctors(userID);

    const favoriteDoc = favoriteDoctors.filter(
      (FDoc) => FDoc.doctorID === doctorID,
    );

    if (favoriteDoc.length > 0) {
      this.favoriteRepo.removeFavoriteDoctor(doctorID);
      return undefined;
    } else {
      const favorite = await this.favoriteRepo.addFavoriteDcotor({
        userID,
        doctorID,
      });

      return favorite;
    }
  }
}
