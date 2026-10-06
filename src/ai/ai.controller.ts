import { randomBytes } from 'crypto';

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

import { AiService } from './ai.service';
import { SendAiMessageDto } from './dto/send-ai-message.dto';

@OptionalAuth()
@Controller('ai/conversations')
export class AiController {
  constructor(private readonly service: AiService) {}

  private async identity(req: Request, res: Response) {
    const current = req.cookies?.aiDevice as string | undefined;
    const device =
      current && /^[a-f0-9]{64}$/.test(current)
        ? current
        : randomBytes(32).toString('hex');
    if (device !== current)
      res.cookie('aiDevice', device, {
        httpOnly: true,
        secure: ['prod', 'production'].includes(process.env.NODE_ENV ?? ''),
        sameSite: 'lax',
        path: '/',
        maxAge: 365 * 86400000,
      });
    const user = req.credentials?.user.id;
    if (user) {
      await this.service.claim(device, user);
      // Rotate the guest capability after transfer; logout cannot reclaim old history.
      res.cookie('aiDevice', randomBytes(32).toString('hex'), {
        httpOnly: true,
        secure: ['prod', 'production'].includes(process.env.NODE_ENV ?? ''),
        sameSite: 'lax',
        path: '/',
        maxAge: 365 * 86400000,
      });
    }
    return user ? `u:${user}` : `g:${device}`;
  }

  @Post()
  async create(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.service.create(await this.identity(req, res));
  }

  @Get()
  async list(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.service.list(await this.identity(req, res));
  }

  @Get(':id')
  async get(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.service.get(id, await this.identity(req, res));
  }

  @Post(':id/messages')
  async send(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SendAiMessageDto,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const owner = await this.identity(req, res);
    const message = await this.service.send(
      id,
      owner,
      dto.requestId,
      dto.content,
    );
    await this.stream(id, message.id, owner, res);
  }

  @Get(':id/messages/:messageId/stream')
  async reconnect(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('messageId', ParseUUIDPipe) messageId: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const owner = await this.identity(req, res);
    await this.service.message(id, messageId, owner);
    await this.stream(id, messageId, owner, res);
  }

  private async stream(
    id: string,
    messageId: string,
    owner: string,
    res: Response,
  ) {
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
        const message = await this.service.message(id, messageId, owner);
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
