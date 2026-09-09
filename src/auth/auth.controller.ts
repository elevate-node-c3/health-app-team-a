import { Body, Controller, Get, Post, Query, Req, Res } from '@nestjs/common';
import { type Request, type Response } from 'express';
import { Auth } from 'src/common/decorators/auth.decorator';
import { COOKIE_OPTION } from 'src/config/cookie';

import { AuthService } from './auth.service';
import { ForgetPasswordDTO } from './dto/forgetPassword.dto';
import { GetUsersQueryDto } from './dto/get-users-query.dto';
import { LoginDto } from './dto/login.dto';
import { ResetPasswordDto } from './dto/resetPassword.dto';
import { ResendOtpDto } from './dto/resendOtp.dto';
import { SignupDto } from './dto/signup.dto';
import { VerifyOtpDto } from './dto/verifyOtp.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('/signup')
  async signup(@Body() dto: SignupDto) {
    return await this.authService.signup(dto);
  }

  @Post('/resend-otp')
  async resendOtp(@Body() dto: ResendOtpDto) {
    return await this.authService.resendOtp(dto);
  }

  @Post('/verify-email')
  async verifyPhone(
    @Body() dto: VerifyOtpDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.verifyPhone(dto);
    res.cookie('token', result.token, COOKIE_OPTION);
    return { message: result.message };
  }

  @Post('/login')
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = await this.authService.login(dto);

    res.cookie('token', token, COOKIE_OPTION);

    return {
      message: 'Logged in successfully!',
    };
  }

  @Auth()
  @Post('/logout')
  async logout(@Req() req: Request) {
    await this.authService.logout(req.credentials);
    return { message: 'Logged out successfully' };
  }
  
  @Post('/forget-password')
  async forgetPassword(@Body() dto: ForgetPasswordDTO) {
    const result = await this.authService.forgetPassword(dto);
    return {message: result.message, phone: result.phone, otp: result.otp};
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
  async getMe(@Req() req: Request) {
    const user = req.credentials.user;
    return {
      user
    };
  }
}
