import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { type Request, type Response } from 'express';
import { OptionalAuth } from 'src/common/decorators/auth.decorator';

import { accountOwner, guestOwner } from './ai-owner';
import { AiService } from './ai.service';
import { SendAiMessageDto } from './dto/send-ai-message.dto';

@OptionalAuth()
@Controller('ai/conversations')
export class AiController {
  constructor(private readonly service: AiService) {}

  private async owner(req: Request) {
    const user = req.credentials?.user.id;
    if (user) await this.service.claim(req.deviceId!, user);
    return user ? accountOwner(user) : guestOwner(req.deviceId!);
  }

  @Post()
  async create(@Req() req: Request) {
    return this.service.create(await this.owner(req));
  }

  @Get()
  async list(@Req() req: Request) {
    return this.service.list(await this.owner(req));
  }

  @Get(':id')
  async get(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    return this.service.get(id, await this.owner(req));
  }

  @Post(':id/messages')
  async send(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SendAiMessageDto,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const owner = await this.owner(req);
    const message = await this.service.send(
      id,
      owner,
      dto.requestId,
      dto.content,
    );
    await this.stream(id, message.id, res);
  }

  @Get(':id/messages/:messageId/stream')
  async reconnect(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('messageId', ParseUUIDPipe) messageId: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const owner = await this.owner(req);
    await this.service.message(id, messageId, owner);
    await this.stream(id, messageId, res);
  }

  // Ownership is verified once by send()/reconnect() above, before the
  // stream opens. Conversation ownership can't change mid-stream, so this
  // loop polls via `pollMessage()` — plain state reads, no repeated
  // ownership check on every 150ms tick for the life of a generation.
  private async stream(id: string, messageId: string, res: Response) {
    res.set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();
    let last = '';
    let closed = false;
    const close = () => {
      closed = true;
    };
    res.on('close', close);
    try {
      while (!closed) {
        const message = await this.service.pollMessage(id, messageId);
        const payload = JSON.stringify(message);
        if (payload !== last) {
          res.write(
            `event: ${message.outcome === 'streaming' ? 'snapshot' : 'done'}\ndata: ${payload}\n\n`,
          );
          (res as Response & { flush?: () => void }).flush?.();
          last = payload;
        }
        if (message.outcome !== 'streaming') break;
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
    } catch {
      if (!closed)
        res.write(
          'event: error\ndata: {"message":"Unable to load response. Reopen the conversation."}\n\n',
        );
    } finally {
      res.off('close', close);
      res.end();
    }
  }
}
