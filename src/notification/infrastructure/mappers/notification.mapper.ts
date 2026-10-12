import { Notification } from 'src/notification/domain/entities/notification.model';
import { NotificationOrmEntity } from 'src/notification/infrastructure/entities/typeorm/notification.entity';

export class NotificationMapper {
  static toDomain(ormEntity: NotificationOrmEntity): Notification {
    return new Notification(
      ormEntity.id,
      ormEntity.userId,
      ormEntity.eventId,
      ormEntity.type,
      ormEntity.title,
      ormEntity.body,
      ormEntity.data,
      ormEntity.readAt,
      ormEntity.createdAt,
    );
  }
}
