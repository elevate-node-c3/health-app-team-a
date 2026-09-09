import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SecurityService } from 'src/common/services/security/security.service';
import { TokenService } from 'src/common/services/token/token.service';
import { RedisService } from 'src/infrastructure/cache/redis.service';

import { EmailService } from '../common/services/email/email.service';
import { OtpService } from '../common/services/otp/otp.service';

import { UserCredentials } from './auth.type';
import {
  USER_REPOSITORY,
  type UserRepository,
} from './domain/repositories/user.repository';
import { ForgetPasswordDTO } from './dto/forgetPassword.dto';
import { LoginDto } from './dto/login.dto';
import { VerifyOtpDto } from './dto/verifyOtp.dto';

@Injectable()
export class AuthService {
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepo: UserRepository,
    private readonly securityService: SecurityService,
    private readonly tokenService: TokenService,
    private readonly redisService: RedisService,
    private readonly otpService: OtpService,
    private readonly emailService: EmailService,
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

  async logout(credentials: UserCredentials) {
    const { jti, iat, sub } = credentials.decoded;
    return await this.redisService.set(
      this.redisService.revokedTokenKey({ jti, userId: sub }),
      jti,
      iat + 7 * 24 * 60 * 60 - Math.floor(Date.now() / 1000),
    );
  }
  async forgetPassword(dto: ForgetPasswordDTO) {
    const { email } = dto;
    const user = await this.userRepo.findByEmail(email);
    if (!user) throw new NotFoundException('this email not found');
    //create OTP and save it in redis
    const OTP = await this.otpService.send(
      user.id.toString(),
      'password-reset',
    );
    //send otp to user email
    return await this.emailService.sendOtp(user.email, OTP);
  }

  async verifyOtp(dto: VerifyOtpDto) {
    const user = await this.userRepo.findByEmail(dto.email);
    if (!user) throw new NotFoundException('this email not found');

    await this.otpService.verify(user.id.toString(), 'password-reset', dto.otp);

    return { message: 'OTP verified successfully' };
  }
}
