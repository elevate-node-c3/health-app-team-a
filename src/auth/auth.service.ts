import { randomUUID } from 'crypto';

import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';

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
import { LoginDto } from './dto/login.dto';
import { ResendVerificationDto } from './dto/resend-verification.dto';
import { SignupDto } from './dto/signup.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';

import { MailService } from '@/common/services/mail/mail.service';
import { OtpService } from '@/common/services/otp/otp.service';
import { SecurityService } from '@/common/services/security/security.service';
import { IJwtUserPayload } from '@/common/services/token/jwt.type';
import { TokenService } from '@/common/services/token/token.service';

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
  ) {}

  async signup(dto: SignupDto): Promise<void> {
    const existingUser = await this.userRepo.findByEmail(dto.email);

    if (existingUser && existingUser.isVerified) {
      throw new BadRequestException('Email is already in use');
    }

    if (existingUser && !existingUser.isVerified) {
      await this.sendSignupVerificationCode(existingUser);
      return;
    }

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
    await this.sendSignupVerificationCode(user);
  }

  async resendVerification(dto: ResendVerificationDto): Promise<void> {
    const user = await this.userRepo.findByEmail(dto.email);

    if (!user) throw new BadRequestException('User not found');

    if (user.isVerified)
      throw new BadRequestException('Email is already verified');

    await this.sendSignupVerificationCode(user);
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

  private async sendSignupVerificationCode(user: User): Promise<void> {
    const otp = await this.otpService.send(user.id, 'signup');
    await this.mailService.sendSignupVerification(user.email, otp);
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

    return await this.startSession(user, deviceInfo);
  }

  async refresh(credentials: UserCredentials): Promise<TokenPair> {
    const { sub, email, sid, jti } = credentials.decoded;

    await this.sessionRepo.revokeToken(jti);

    return await this.issueTokenPair(
      { sub, email, sid, level: credentials.user.accessLevel },
      credentials.session,
    );
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
