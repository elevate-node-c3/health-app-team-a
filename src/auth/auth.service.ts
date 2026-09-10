import { randomUUID } from 'crypto';

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { SecurityService } from 'src/common/services/security/security.service';
import { TokenService } from 'src/common/services/token/token.service';
import { maskPhone, normalizePhone } from 'src/common/utils/phone.util';
import { RedisService } from 'src/infrastructure/cache/redis.service';

import { EmailService } from '../common/services/email/email.service';
import { OtpService } from '../common/services/otp/otp.service';

import { UserCredentials } from './auth.type';
import { User } from './domain/entities/user.model';
import {
  USER_REPOSITORY,
  type UserRepository,
} from './domain/repositories/user.repository';
import { ForgetPasswordDTO } from './dto/forgetPassword.dto';
import { GetUsersQueryDto } from './dto/get-users-query.dto';
import { LoginDto } from './dto/login.dto';
import { ResendOtpDto } from './dto/resendOtp.dto';
import { ResetPasswordDto } from './dto/resetPassword.dto';
import { SignupDto } from './dto/signup.dto';
import { VerifyOtpDto } from './dto/verifyOtp.dto';
import {
  UserRegisteredEvent,
  UserVerificationCodeIssuedEvent,
  UserVerifiedEvent,
} from './events/user.events';

@Injectable()
export class AuthService {
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepo: UserRepository,
    private readonly securityService: SecurityService,
    private readonly tokenService: TokenService,
    private readonly redisService: RedisService,
    private readonly otpService: OtpService,
    private readonly emailService: EmailService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async signup(dto: SignupDto) {
    const normalizedPhone = normalizePhone(dto.phone);
    const existingUsers = await this.userRepo.findByEmailOrPhone(
      dto.email,
      normalizedPhone,
    );

    if (existingUsers.length > 0) {
      const errors: string[] = [];
      let unverifiedUserToResend: User | null = null;

      for (const u of existingUsers) {
        if (u.email === dto.email) {
          if (u.isVerified) {
            errors.push('This email is already registered');
          } else {
            unverifiedUserToResend = u;
          }
        }
        if (u.phone === normalizedPhone) {
          if (u.id !== unverifiedUserToResend?.id || u.isVerified) {
            errors.push('This phone number is already registered');
          }
        }
      }

      if (unverifiedUserToResend && errors.length === 0) {
        await this.resendVerificationCode(
          unverifiedUserToResend.id,
          unverifiedUserToResend.email,
          unverifiedUserToResend.phone,
        );
        throw new ConflictException('email registered but not verified');
      }

      if (errors.length > 0) {
        throw new ConflictException({ message: 'Validation failed', errors });
      }
    }

    const hashedPassword = await this.securityService.hash(dto.password);
    const newUser = new User(
      randomUUID(),
      dto.name,
      dto.email,
      normalizedPhone,
      dto.gender,
      true,
      false,
      new Date(),
      new Date(),
      hashedPassword,
    );

    await this.userRepo.save(newUser);
    this.eventEmitter.emit(
      'user.registered',
      new UserRegisteredEvent(newUser.id, newUser.email, newUser.phone),
    );

    const otp = await this.resendVerificationCode(
      newUser.id,
      newUser.email,
      newUser.phone,
    );

    return {
      message: 'Account created successfully. Please verify your phone number.',
      phone: maskPhone(newUser.phone),
      otp, // Added for local testing as email is failing
    };
  }

  private async resendVerificationCode(
    userId: string,
    email: string,
    phone: string,
  ) {
    const otp = await this.otpService.send(userId, 'phone-verification');
    try {
      await this.emailService.sendOtp(email, otp);
    } catch (e) {
      console.error('Failed to send OTP email', e);
    }
    this.eventEmitter.emit(
      'user.verification_code.issued',
      new UserVerificationCodeIssuedEvent(userId, email, phone),
    );
    return otp;
  }

  async resendOtp(dto: ResendOtpDto) {
    const user = await this.userRepo.findByEmail(dto.email);
    if (!user) throw new NotFoundException('User not found');
    if (user.isVerified)
      throw new BadRequestException('User is already verified');

    const otp = await this.resendVerificationCode(
      user.id,
      user.email,
      user.phone,
    );
    return {
      otp,
      message: 'OTP resent successfully',
      phone: maskPhone(user.phone),
    };
  }

  async verifyPhone(dto: VerifyOtpDto) {
    const user = await this.userRepo.findByEmail(dto.email);
    if (!user) throw new NotFoundException('User not found');

    await this.otpService.verify(user.id, 'phone-verification', dto.otp);

    user.isVerified = true;
    await this.userRepo.save(user);

    this.eventEmitter.emit(
      'user.verified',
      new UserVerifiedEvent(user.id, user.email, user.phone),
    );

    const payload = {
      sub: user.id,
      email: user.email,
    };
    const token = await this.tokenService.sign(payload);
    return { token, message: 'Account verified successfully' };
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
    if (!user.isVerified)
      throw new ForbiddenException('Account has not been verified');

    const payload = {
      sub: user.id,
      email: user.email,
    };
    return await this.tokenService.sign(payload);
  }

  async logout(credentials: UserCredentials) {
    const { jti, exp, sub } = credentials.decoded;
    const ttlMs = Math.max(0, exp * 1000 - Date.now());

    if (ttlMs > 0) {
      await this.redisService.set(
        this.redisService.revokedTokenKey({ jti, userId: sub }),
        jti,
        ttlMs,
      );
    }
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
    try {
      await this.emailService.sendOtp(user.email, OTP);
    } catch (e) {
      console.error('Failed to send OTP email', e);
    }

    return {
      message: 'OTP sent successfully',
      phone: maskPhone(user.phone),
      otp: OTP,
    };
  }

  async verifyOtp(dto: VerifyOtpDto) {
    const user = await this.userRepo.findByEmail(dto.email);
    if (!user) throw new NotFoundException('this email not found');

    await this.otpService.verify(user.id.toString(), 'password-reset', dto.otp);

    return { message: 'OTP verified successfully' };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const user = await this.userRepo.findByEmail(dto.email);
    if (!user) throw new NotFoundException('this email not found');

    await this.otpService.consume(user.id.toString(), 'password-reset');

    const hashedPassword = await this.securityService.hash(dto.password);
    user.updatePassword(hashedPassword);

    await this.userRepo.save(user);

    return { message: 'Password reset successfully' };
  }

  async getAllUsers(query: GetUsersQueryDto) {
    const { page, limit } = query;
    const skip = (page - 1) * limit;

    const [users, total] = await this.userRepo.findAll(skip, limit);
    return {
      data: users.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        phone: u.phone,
        gender: u.gender,
        isActive: u.isActive,
        isVerified: u.isVerified,
        createdAt: u.createdAt,
      })),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}
