import { Inject, Injectable } from '@nestjs/common';

import { FAVOURITE_REPOSITORY } from './domain/repositories/favourite.repository';

import type { FavouriteRepository } from './domain/repositories/favourite.repository';

@Injectable()
export class FavouriteService {
  constructor(
    @Inject(FAVOURITE_REPOSITORY)
    private readonly favouriteRepository: FavouriteRepository,
  ) {}

  async add(userId: string, doctorId: string): Promise<{ isFavourite: true }> {
    await this.favouriteRepository.add(userId, doctorId);
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
