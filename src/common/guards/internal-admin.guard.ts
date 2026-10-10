import { timingSafeEqual } from 'crypto';

import { CanActivate, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type Request } from 'express';

@Injectable()
export class InternalAdminGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: Parameters<CanActivate['canActivate']>[0]): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const expectedKey = this.configService.get<string>(
      'INTERNAL_ADMIN_API_KEY',
    );

    const receivedKey = request.get('x-internal-admin-key');
    const actorId = request.get('x-internal-actor-id');

    if (
      !expectedKey ||
      !receivedKey ||
      !actorId ||
      !/^[\w.:@-]{1,128}$/.test(actorId)
    )
      throw new UnauthorizedException('Internal admin credentials required');

    const expected = Buffer.from(expectedKey);
    const received = Buffer.from(receivedKey);
    if (
      received.length !== expected.length ||
      !timingSafeEqual(received, expected)
    )
      throw new UnauthorizedException('Internal admin credentials required');

    return true;
  }
}
