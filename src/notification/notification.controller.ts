import {
  Controller,
  Get,
  MessageEvent,
  Patch,
  Query,
  Req,
  Sse,
} from '@nestjs/common';
import { type Request } from 'express';
import { Observable } from 'rxjs';
import { Verified } from 'src/common/decorators/auth.decorator';

import { ListNotificationsQueryDto } from './dto/list-notifications-query.dto';
import { MarkReadQueryDto } from './dto/mark-read-query.dto';
import { NotificationService } from './notification.service';

@Verified()
@Controller('notifications')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get()
  async list(@Query() query: ListNotificationsQueryDto, @Req() req: Request) {
    return this.notificationService.list(
      req.credentials.user.id,
      query.page,
      query.limit,
    );
  }

  @Get('unread')
  async unread(@Req() req: Request) {
    return this.notificationService.unread(req.credentials.user.id);
  }

  @Patch('read')
  async markGroupRead(@Query() query: MarkReadQueryDto, @Req() req: Request) {
    return this.notificationService.markGroupRead(
      req.credentials.user.id,
      query.group,
    );
  }

  @Sse('stream')
  stream(@Req() req: Request): Observable<MessageEvent> {
    return this.notificationService.connect(req.credentials.user.id);
  }
}
