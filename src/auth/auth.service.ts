import { randomUUID } from 'crypto';

import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { SecurityService } from 'src/common/services/security/security.service';
import { TokenService } from 'src/common/services/token/token.service';
import { RedisService } from 'src/infrastructure/cache/redis.service';

import { OtpService } from '../common/services/otp/otp.service';

import { TokenPair, UserCredentials } from './auth.type';
import { Session } from './domain/entities/session.model';
import { User } from './domain/entities/user.model';
import { TokenType } from './domain/enums/token.enum';
import {
  SESSION_REPOSITORY,
  type SessionRepository,
} from './domain/repositories/session.repository';
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

import { MailService } from '@/common/services/mail/mail.service';
import { IJwtUserPayload } from '@/common/services/token/jwt.type';

@Injectable()
export class AuthService {
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepo: UserRepository,
    @Inject(SESSION_REPOSITORY)
    private readonly sessionRepo: SessionRepository,
    private readonly securityService: SecurityService,
    private readonly otpService: OtpService,
    private readonly mailService: MailService,
    private readonly tokenService: TokenService,
    private readonly redisService: RedisService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async signup(dto: SignupDto): Promise<void> {
    const existingUsers = await this.userRepo.findByEmailOrPhone(
      dto.email,
      dto.phone,
    );

    if (existingUsers.length === 1 && !existingUsers[0].isVerified) {
      await this.resendVerificationCode(
        existingUsers[0].id,
        existingUsers[0].email,
        'email-verification',
      );
      return;
    }

    const duplicateMessages: string[] = [];
    if (existingUsers.length > 0) {
      for (const u of existingUsers) {
        if (u.email === dto.email) {
          if (u.isVerified) {
            duplicateMessages.push('This email is already registered');
          }
        }
        if (u.phone === dto.phone) {
          if (u.isVerified) {
            duplicateMessages.push('This phone number is already registered');
          }
        }
      }
    }

    if (duplicateMessages.length > 0)
      throw new BadRequestException(duplicateMessages);

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
    this.eventEmitter.emit(
      'user.registered',
      new UserRegisteredEvent(user.id, user.email, user.phone),
    );
    await this.resendVerificationCode(
      user.id,
      user.email,
      'email-verification',
    );
  }

  private async resendVerificationCode(
    userId: string,
    email: string,
    type: 'email-verification' | 'forget-password',
  ) {
    const otp = await this.otpService.send(userId, type);
    try {
      await this.mailService.sendOtp(email, otp);
    } catch (e) {
      console.error('Failed to send OTP email', e);
    }

    if (type === 'email-verification') {
      this.eventEmitter.emit(
        'user.verification_code.issued',
        new UserVerificationCodeIssuedEvent(userId, email),
      );
    } else if (type === 'forget-password') {
      this.eventEmitter.emit(
        'user.password_reset_code.issued',
        new UserVerificationCodeIssuedEvent(userId, email),
      );
    }
    return otp;
  }

  async resendOtp(
    dto: ResendOtpDto,
    type: 'email-verification' | 'forget-password',
  ) {
    const user = await this.userRepo.findByEmail(dto.email);
    if (!user) throw new NotFoundException('User not found');
    if (user.isVerified)
      throw new BadRequestException('Email is already verified');

    const otp = await this.resendVerificationCode(user.id, user.email, type);
    return {
      otp,
      message: 'OTP resent successfully',
    };
  }

  async resendVerification(dto: ResendOtpDto): Promise<void> {
    const user = await this.userRepo.findByEmail(dto.email);

    if (!user) throw new BadRequestException('User not found');

    if (user.isVerified)
      throw new BadRequestException('Email is already verified');

    await this.resendVerificationCode(
      user.id,
      user.email,
      'email-verification',
    );
  }

  async verifyEmail(
    dto: VerifyOtpDto,
    deviceInfo: string | null = null,
  ): Promise<TokenPair> {
    const user = await this.userRepo.findByEmail(dto.email);

    if (!user) throw new BadRequestException('User not found');

    if (user.isVerified)
      throw new BadRequestException('Email is already verified');

    await this.otpService.verify(user.id, 'signup', dto.otp);
    await this.otpService.consume(user.id, 'signup');
    this.eventEmitter.emit(
      'user.verified',
      new UserVerifiedEvent(user.id, user.email),
    );

    user.isVerified = true;
    await this.userRepo.save(user);

    return await this.startSession(user, deviceInfo);
  }

  async login(
    dto: LoginDto,
    deviceInfo: string | null = null,
  ): Promise<TokenPair> {
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

    return await this.startSession(user, deviceInfo);
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
      await this.mailService.sendOtp(user.email, OTP);
    } catch (e) {
      console.error('Failed to send OTP email', e);
    }

    return {
      message: 'OTP sent successfully',
    };
  }

  async refresh(credentials: UserCredentials): Promise<TokenPair> {
    const { sub, email, sid, jti } = credentials.decoded;

    await this.sessionRepo.revokeToken(jti);

    return await this.issueTokenPair(
      { sub, email, sid, level: credentials.user.accessLevel },
      credentials.session,
    );
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

    const [users, total] = await this.userRepo.findAll(page, limit);
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

  async logout(
    credentials: UserCredentials,
    everywhere = false,
  ): Promise<void> {
    const { sub, sid } = credentials.decoded;

    if (everywhere) await this.sessionRepo.revokeAllUserSessions(sub);
    else await this.sessionRepo.revokeSession(sid);
  }

  private async startSession(
    user: User,
    deviceInfo: string | null,
  ): Promise<TokenPair> {
    const sid = randomUUID();

    const payload: IJwtUserPayload = {
      sub: user.id,
      email: user.email,
      sid,
      level: user.accessLevel,
    };

    const refresh = await this.tokenService.sign(payload, TokenType.REFRESH);

    await this.sessionRepo.createSessionWithToken(
      {
        id: sid,
        userId: user.id,
        deviceInfo,
        expiresAt: refresh.expiresAt,
      },
      {
        userId: user.id,
        sessionId: sid,
        type: TokenType.REFRESH,
        jti: refresh.jti,
        expiresAt: refresh.expiresAt,
      },
    );

    const access = await this.tokenService.sign(payload, TokenType.ACCESS);

    return {
      accessToken: access.token,
      refreshToken: refresh.token,
    };
  }

  private async issueTokenPair(
    payload: IJwtUserPayload,
    session: Session,
  ): Promise<TokenPair> {
    const refresh = await this.tokenService.sign(
      payload,
      TokenType.REFRESH,
      undefined,
      this.secondsUntilSessionEnds(session),
    );

    await this.sessionRepo.createToken({
      userId: payload.sub,
      sessionId: payload.sid,
      type: TokenType.REFRESH,
      jti: refresh.jti,
      expiresAt: refresh.expiresAt,
    });

    const access = await this.tokenService.sign(payload, TokenType.ACCESS);

    return {
      accessToken: access.token,
      refreshToken: refresh.token,
    };
  }

  private secondsUntilSessionEnds(session: Session): number {
    const remainingMs = session.expiresAt.getTime() - Date.now();

    return Math.max(1, Math.floor(remainingMs / 1000));
  }
}
