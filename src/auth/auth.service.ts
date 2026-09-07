import { randomUUID } from 'crypto';

import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';

import { User } from './domain/entities/user.model';
import {
  USER_REPOSITORY,
  type UserRepository,
} from './domain/repositories/user.repository';
import { LoginDto } from './dto/login.dto';
import { SignupDto } from './dto/signup.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';

import { MailService } from '@/common/services/mail/mail.service';
import { OtpService } from '@/common/services/otp/otp.service';
import { SecurityService } from '@/common/services/security/security.service';
import { TokenService } from '@/common/services/token/token.service';

@Injectable()
export class AuthService {
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepo: UserRepository,
    private readonly securityService: SecurityService,
    private readonly otpService: OtpService,
    private readonly mailService: MailService,
    private readonly tokenService: TokenService,
  ) {}

  async signup(dto: SignupDto): Promise<void> {
    const existingUser = await this.userRepo.findByEmail(dto.email);

    if (existingUser) throw new BadRequestException('Email is already in use');

    const passwordHash = await this.securityService.hash(dto.password);
    const now = new Date();
    const user = new User(
      randomUUID(),
      dto.name,
      dto.email,
      dto.phone,
      dto.gender,
      true,
      false,
      now,
      now,
      passwordHash,
    );

    await this.userRepo.save(user);

    const otp = await this.otpService.send(user.id, 'signup');
    await this.mailService.sendSignupVerification(user.email, otp);
  }

  async verifyEmail(dto: VerifyEmailDto): Promise<void> {
    const user = await this.userRepo.findByEmail(dto.email);

    if (!user) throw new BadRequestException('User not found');

    if (user.isVerified)
      throw new BadRequestException('Email is already verified');

    await this.otpService.verify(user.id, 'signup', dto.otp);
    await this.otpService.consume(user.id, 'signup');

    user.isVerified = true;
    await this.userRepo.save(user);
  }

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
      isActive: user.isActive,
    };
    return await this.tokenService.sign(payload);
  }
}
