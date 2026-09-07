import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { TooManyRequestsException } from 'src/common/exceptions/too-many-requests.exception';
import { SecurityService } from 'src/common/services/security/security.service';
import { generateOtp } from 'src/common/utils/otp.util';
import { RedisService } from 'src/infrastructure/cache/redis.service';

const OTP_TTL_MS = 2 * 60 * 1000;
const OTP_VERIFIED_TTL_MS = 10 * 60 * 1000;
const OTP_BLOCK_TTL_MS = 7 * 60 * 1000;
const MAX_ATTEMPTS = 5;

interface OtpRecord {
  hashedOtp?: string;
  attempts?: number;
  verified?: boolean;
}

@Injectable()
export class OtpService {
  constructor(
    private readonly redisService: RedisService,
    private readonly securityService: SecurityService,
  ) {}

  async send(userId: string, subject: string): Promise<string> {
    const blockTtl = await this.redisService.getTTL(
      this.redisService.otpKeyBlock({ userId, subject }),
    );

    if (blockTtl > 0) {
      throw new TooManyRequestsException(
        `Too many requests. Please try again in ${Math.ceil(blockTtl / 1000 / 60)} minutes`,
      );
    }

    const otpKey = this.redisService.otpKey({ userId, subject });
    const currentOtpTtl = await this.redisService.getTTL(otpKey);

    if (currentOtpTtl > 0) {
      throw new TooManyRequestsException(
        `Please wait ${Math.ceil(currentOtpTtl / 1000 / 60)} minutes before requesting a new code`,
      );
    }

    const otp = generateOtp();

    await this.redisService.set(
      otpKey,
      { hashedOtp: await this.securityService.hash(otp), attempts: 1 },
      OTP_TTL_MS,
    );

    return otp;
  }

  async verify(userId: string, subject: string, otp: string): Promise<boolean> {
    const blockTtl = await this.redisService.getTTL(
      this.redisService.otpKeyBlock({ userId, subject }),
    );

    if (blockTtl > 0) {
      throw new TooManyRequestsException(
        `Too many requests. Please try again in ${Math.ceil(blockTtl / 1000 / 60)} minutes`,
      );
    }

    const otpKey = this.redisService.otpKey({ userId, subject });
    const record = await this.redisService.get<OtpRecord>(otpKey);

    if (!record)
      throw new NotFoundException('No OTP found or code has expired');

    if (record.verified) {
      throw new ConflictException('OTP has already been verified');
    }

    const { hashedOtp, attempts = 0 } = record;

    if (!hashedOtp || !(await this.securityService.verify(hashedOtp, otp))) {
      const newAttempts = attempts + 1;

      if (newAttempts >= MAX_ATTEMPTS) {
        await Promise.all([
          this.redisService.set(
            this.redisService.otpKeyBlock({ userId, subject }),
            1,
            OTP_BLOCK_TTL_MS,
          ),
          this.redisService.del(otpKey),
        ]);
        throw new TooManyRequestsException(
          'Too many failed attempts. Please request a new code',
        );
      }

      await this.redisService.set(
        otpKey,
        { hashedOtp, attempts: newAttempts },
        await this.redisService.getTTL(otpKey),
      );
      throw new UnauthorizedException(
        `Invalid verification code. Only ${MAX_ATTEMPTS - newAttempts} attempts left`,
      );
    }

    await this.redisService.set(
      otpKey,
      { verified: true },
      OTP_VERIFIED_TTL_MS,
    );
    return true;
  }

  async consume(userId: string, subject: string): Promise<boolean> {
    const otpKey = this.redisService.otpKey({ userId, subject });
    const record = await this.redisService.get<OtpRecord>(otpKey);

    if (!record)
      throw new NotFoundException('No OTP found or code has expired');

    if (!record.verified) {
      throw new ForbiddenException('OTP has not been verified yet');
    }

    await this.redisService.del(otpKey);
    return true;
  }
}
