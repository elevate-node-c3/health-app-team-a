import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppointmentOrmEntity } from 'src/appointment/infrastructure/entities/typeorm/appointment.entity';
import { AuthModule } from 'src/auth/auth.module';
import { MessagingModule } from 'src/infrastructure/messaging/messaging.module';

import { NOTIFICATION_REPOSITORY } from './domain/repositories/notification.repository';
import { NotificationOrmEntity } from './infrastructure/entities/typeorm/notification.entity';
import { TypeOrmNotificationRepository } from './infrastructure/repositories/typeorm-notification.repository';
import { NotificationStreamService } from './notification-stream.service';
import { NotificationController } from './notification.controller';
import { NotificationListener } from './notification.listener';
import { NotificationService } from './notification.service';

@Module({
  imports: [
    AuthModule,
    MessagingModule,
    TypeOrmModule.forFeature([NotificationOrmEntity, AppointmentOrmEntity]),
  ],
  controllers: [NotificationController],
  providers: [
    NotificationService,
    NotificationStreamService,
    NotificationListener,
    {
      provide: NOTIFICATION_REPOSITORY,
      useClass: TypeOrmNotificationRepository,
    },
  ],
  exports: [NOTIFICATION_REPOSITORY],
})
export class NotificationModule {}
