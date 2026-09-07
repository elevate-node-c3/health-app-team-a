import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { SecurityService } from 'src/common/services/security/security.service';
import { TokenService } from 'src/common/services/token/token.service';

import {
  USER_REPOSITORY,
  type UserRepository,
} from './domain/repositories/user.repository';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepo: UserRepository,
    private readonly securityService: SecurityService,
    private readonly tokenService: TokenService,
  ) {}

  async login(dto: LoginDto) {
    const { email, password } = dto;
    const user = await this.userRepo.findByEmail(email);

    if (
      !user ||
      !(await this.securityService.verify(user.getPasswordHash(), password))
    )
      throw new BadRequestException('Wrong email or password');

    if (!user.isActive)
      throw new ForbiddenException('Account has been deactivated');

    const payload = {
      sub: user.id,
      email: user.email,
    };
    return await this.tokenService.sign(payload);
  }
}
