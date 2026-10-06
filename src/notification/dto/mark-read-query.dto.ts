import { IsEnum } from 'class-validator';
import { NotificationGroup } from 'src/notification/domain/enums/notification-group.enum';

export class MarkReadQueryDto {
  @IsEnum(NotificationGroup)
  group!: NotificationGroup;
}
