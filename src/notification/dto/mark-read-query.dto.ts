import { IsEnum, IsISO8601 } from 'class-validator';
import { NotificationGroup } from 'src/notification/domain/enums/notification-group.enum';

export class MarkReadQueryDto {
  @IsEnum(NotificationGroup)
  group!: NotificationGroup;

  @IsISO8601({ strict: true })
  groupBoundary!: string;
}
