import { Inject, Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';

import { FAVOURITE_REPOSITORY } from './domain/repositories/favourite.repository';
import { TypeOrmFavouriteRepository } from './infrastructure/repositories/typeorm-favourite.repository';

@Injectable()
export class FavouriteService {
  constructor(
    @Inject(FAVOURITE_REPOSITORY)
    private readonly favouriteRepository: TypeOrmFavouriteRepository,
    @Inject('Notifications_Health_App')
    private readonly rabbitMQClient: ClientProxy,
  ) {}

  async add(userId: string, doctorId: string): Promise<{ isFavourite: true }> {
    await this.favouriteRepository.add(userId, doctorId);

    // publish event
    const event = {
      eventId: crypto.randomUUID(),
      userId,
      doctorId,
      payload: {
        message: 'Doctor Favorited',
      },
    };
    this.rabbitMQClient.emit('notifications_health_app', event);

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
