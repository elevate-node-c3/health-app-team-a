import {
  Ctx,
  MessagePattern,
  Payload,
  RmqContext,
} from '@nestjs/microservices';

import { NotificationService } from './notification.service';

export class NotificationsConsumer {
  constructor(private readonly notificationService: NotificationService) {}

  @MessagePattern('DoctorFavorited')
  getNotifications(@Payload() data: number[], @Ctx() context: RmqContext) {
    console.log(context.getMessage());
  }
}
// function handleDoctorFavorited(event: Event | undefined, FavoriteEvent: any) {
//   throw new Error('Function not implemented.');
// }
