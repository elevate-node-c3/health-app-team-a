import { Body, Controller, Post, Req, Res } from '@nestjs/common';
import { type Request, type Response } from 'express';
import { maskEmail } from 'src/auth/utils/contact.util';
import { Auth, RefreshAuth } from 'src/common/decorators/auth.decorator';
import { COOKIE_OPTION, REFRESH_COOKIE_OPTION } from 'src/config/cookie';

import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { LogoutDto } from './dto/logout.dto';
import { ResendVerificationDto } from './dto/resend-verification.dto';
import { SignupDto } from './dto/signup.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('/signup')
  async signup(@Body() dto: SignupDto) {
    await this.authService.signup(dto);

    return {
      message: 'Signed up successfully!',
      destination: maskEmail(dto.email),
    };
  }

  @Post('/verify-email')
  async verifyEmail(
    @Body() dto: VerifyEmailDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { accessToken, refreshToken } = await this.authService.verifyEmail(
      dto,
      req.get('user-agent') ?? null,
    );

    res.cookie('accessToken', accessToken, COOKIE_OPTION);
    res.cookie('refreshToken', refreshToken, REFRESH_COOKIE_OPTION);

    return {
      message: 'Email verified successfully!',
    };
  }

  @Post('/resend-verification')
  async resendVerification(@Body() dto: ResendVerificationDto) {
    await this.authService.resendVerification(dto);

    return {
      message: 'Verification code sent successfully!',
      destination: maskEmail(dto.email),
    };
  }

  @Post('/login')
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { accessToken, refreshToken } = await this.authService.login(
      dto,
      req.get('user-agent') ?? null,
    );

    res.cookie('accessToken', accessToken, COOKIE_OPTION);
    res.cookie('refreshToken', refreshToken, REFRESH_COOKIE_OPTION);

    return {
      message: 'Logged in successfully!',
    };
  }

  @RefreshAuth()
  @Post('/refresh')
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { accessToken, refreshToken } = await this.authService.refresh(
      req.credentials,
    );

    res.cookie('accessToken', accessToken, COOKIE_OPTION);
    res.cookie('refreshToken', refreshToken, REFRESH_COOKIE_OPTION);

    return { message: 'Token refreshed successfully' };
  }

  @Auth()
  @Post('/logout')
  async logout(
    @Body() dto: LogoutDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const everywhere = dto.everywhere ?? false;

    await this.authService.logout(req.credentials, everywhere);

    res.clearCookie('token', COOKIE_OPTION);
    res.clearCookie('refreshToken', REFRESH_COOKIE_OPTION);

    return {
      message: everywhere
        ? 'Signed out on all devices'
        : 'Logged out successfully',
    };
  }
}
