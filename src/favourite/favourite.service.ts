import { randomUUID } from 'crypto';

import { Inject, Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';

import { FAVOURITE_REPOSITORY } from './domain/repositories/favourite.repository';

import type { FavouriteRepository } from './domain/repositories/favourite.repository';

export interface FavoriteEvent {
  eventID: string;
  userID: string;
  doctorID: string;
}

@Injectable()
export class FavouriteService {
  constructor(
    @Inject(FAVOURITE_REPOSITORY)
    private readonly favouriteRepository: FavouriteRepository,
    @Inject('FAVORITE_DOCTOR') private readonly rabbiteClient: ClientProxy,
  ) {}

  async add(userId: string, doctorId: string): Promise<{ isFavourite: true }> {
    await this.favouriteRepository.add(userId, doctorId);

    //create event and publish it
    const event: FavoriteEvent = {
      eventID: randomUUID(),
      doctorID: doctorId,
      userID: userId,
    };
    this.rabbiteClient.emit('DoctorFavorited', event);

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
