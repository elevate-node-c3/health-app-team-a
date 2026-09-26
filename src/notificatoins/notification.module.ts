import { Module } from '@nestjs/common';

import { NotificationsConsumer } from './notification.controler';
import { NotificationService } from './notification.service';

@Module({
  controllers: [NotificationsConsumer],
  providers: [NotificationService],
})
export class NotificationsModule {}
