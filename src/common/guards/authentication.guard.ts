import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Inject,
  ForbiddenException,
} from '@nestjs/common';
import { type Request } from 'express';
import {
  USER_REPOSITORY,
  type UserRepository,
} from 'src/auth/domain/repositories/user.repository';
import { IDecodedJwtPayload } from 'src/common/services/token/jwt.type';
import { TokenService } from 'src/common/services/token/token.service';
import { RedisService } from 'src/infrastructure/cache/redis.service';
@Injectable()
export class AuthenticationGuard implements CanActivate {
  constructor(
    private readonly tokenService: TokenService,
    private readonly redisService: RedisService,
    @Inject(USER_REPOSITORY) private readonly userRepo: UserRepository,
  ) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    let token: string | null = null;
    let req: Request | null = null;
    switch (context.getType()) {
      case 'http': {
        req = context.switchToHttp().getRequest<Request>();
        token = req.cookies['token'] as string;
        break;
      }
      case 'ws':
      case 'rpc':
    }

    if (!token || !req) {
      throw new UnauthorizedException();
    }

    let decoded: IDecodedJwtPayload;
    try {
      decoded = (await this.tokenService.verify(token)) as IDecodedJwtPayload;
    } catch {
      throw new UnauthorizedException();
    }

    const { jti, sub } = decoded;

    const user = await this.userRepo.findById(sub);

    const revokedTokenKey = this.redisService.revokedTokenKey({
      jti,
      userId: sub,
    });

    const isRevoked = await this.redisService.get(revokedTokenKey);
    if (isRevoked) throw new UnauthorizedException();

    if (!user || !user.isActive) {
      if (!user) throw new UnauthorizedException();
      throw new ForbiddenException('Account has been deactivated');
    }

    if (!user.isVerified)
      throw new ForbiddenException('Please verify your account to continue');

    req.credentials = { user, decoded };

    return true;
  }
}
