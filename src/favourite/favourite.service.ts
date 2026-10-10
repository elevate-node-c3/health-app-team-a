import { Inject, Injectable } from '@nestjs/common';
import { FAVOURITE_ADDED_EVENT } from 'src/infrastructure/messaging/event-names';
import { EVENT_PUBLISHER } from 'src/infrastructure/messaging/event-publisher.port';

import { FAVOURITE_REPOSITORY } from './domain/repositories/favourite.repository';

import type { FavouriteRepository } from './domain/repositories/favourite.repository';
import type { EventPublisher } from 'src/infrastructure/messaging/event-publisher.port';

@Injectable()
export class FavouriteService {
  constructor(
    @Inject(FAVOURITE_REPOSITORY)
    private readonly favouriteRepository: FavouriteRepository,
    @Inject(EVENT_PUBLISHER)
    private readonly events: EventPublisher,
  ) {}

  async add(userId: string, doctorId: string): Promise<{ isFavourite: true }> {
    const added = await this.favouriteRepository.add(userId, doctorId);

    if (added) {
      const doctorName =
        await this.favouriteRepository.findDoctorName(doctorId);
      if (doctorName)
        this.events.emit(FAVOURITE_ADDED_EVENT, {
          userId,
          doctorId,
          doctorName,
        });
    }

    return { isFavourite: true };
  }

  async remove(
    userId: string,
    doctorId: string,
  ): Promise<{ isFavourite: false }> {
    await this.favouriteRepository.remove(userId, doctorId);
    return { isFavourite: false };
  }
}
