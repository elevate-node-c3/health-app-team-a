import { Body, Controller, Get, Post, Query, Req, Res } from '@nestjs/common';
import { type Request, type Response } from 'express';
import { maskEmail } from 'src/auth/utils/contact.util';
import { Auth, RefreshAuth } from 'src/common/decorators/auth.decorator';
import { COOKIE_OPTION, REFRESH_COOKIE_OPTION } from 'src/config/cookie';

import { AuthService } from './auth.service';
import { ForgetPasswordDTO } from './dto/forgetPassword.dto';
import { GetUsersQueryDto } from './dto/get-users-query.dto';
import { LoginDto } from './dto/login.dto';
import { LogoutDto } from './dto/logout.dto';
import { ResendOtpDto } from './dto/resendOtp.dto';
import { ResetPasswordDto } from './dto/resetPassword.dto';
import { SignupDto } from './dto/signup.dto';
import { VerifyOtpDto } from './dto/verifyOtp.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('/signup')
  async signup(@Body() dto: SignupDto) {
    await this.authService.signup(dto);

    return {
      message: 'Account created successfully. Please verify your email!',
      destination: maskEmail(dto.email),
    };
  }

  @Post('/verify-email')
  async verifyEmail(
    @Body() dto: VerifyOtpDto,
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
  async resendVerification(@Body() dto: ResendOtpDto) {
    await this.authService.resendOtp(dto, 'email-verification');

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

  @Post('/forget-password')
  async forgetPassword(@Body() dto: ForgetPasswordDTO) {
    const result = await this.authService.forgetPassword(dto);
    return { message: result.message, destination: maskEmail(dto.email) };
  }

  @Post('/forget-password/resend-otp')
  async resendOtp(@Body() dto: ResendOtpDto) {
    await this.authService.resendOtp(dto, 'forget-password');
    return {
      message: 'OTP resent successfully',
      destination: maskEmail(dto.email),
    };
  }

  @Post('/verify-otp')
  async verifyOTP(@Body() dto: VerifyOtpDto) {
    return await this.authService.verifyOtp(dto);
  }

  @Post('/reset-password')
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return await this.authService.resetPassword(dto);
  }

  @Auth()
  @Get('/users')
  async getAllUsers(@Query() query: GetUsersQueryDto) {
    return await this.authService.getAllUsers(query);
  }

  @Auth()
  @Get('/me')
  getMe(@Req() req: Request) {
    const user = req.credentials.user;
    return {
      user,
    };
  }
}
