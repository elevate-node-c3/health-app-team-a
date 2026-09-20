import { FavoriteDoctor } from './domain/entitties/favorite-doctor.model';
import { FavoriteDoctorRepo } from './domain/repositories/favorite-doctor.repository';
import { FavoriteDoctorDTO } from './dto/favorite-doctor.dto';

import { EventService } from '@/common/services/event/event.service';

export class FavoriteService {
  constructor(
    private readonly favoriteRepo: FavoriteDoctorRepo,
    private readonly eventService: EventService,
  ) {}
  async addFavoritDoctor(
    dto: FavoriteDoctorDTO,
  ): Promise<FavoriteDoctor | undefined> {
    const { userID, doctorID } = dto;
    const favoriteDoctors = await this.favoriteRepo.findFavoriteDoctors(userID);

    const favoriteDoc = favoriteDoctors.filter(
      (FDoc) => FDoc.doctorID === doctorID,
    );

    if (favoriteDoc.length > 0) {
      this.favoriteRepo.removeFavoriteDoctor(doctorID);
      this.eventService.publishEvent('DoctorUnfavorited');
      return undefined;
    } else {
      const favorite = await this.favoriteRepo.addFavoriteDcotor(dto);

      this.eventService.publishEvent('DoctorFavorited', {
        favoriteId: favorite.id,
        payload: favorite,
      });

      return favorite;
    }
  }
}
