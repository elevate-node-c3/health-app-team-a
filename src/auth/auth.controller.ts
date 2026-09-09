import { Body, Controller, Get, Post, Req, Res } from '@nestjs/common';
import { type Request, type Response } from 'express';
import { Auth } from 'src/common/decorators/auth.decorator';
import { COOKIE_OPTION } from 'src/config/cookie';

import { AuthService } from './auth.service';
import { ForgetPasswordDTO } from './dto/forgetPassword.dto';
import { LoginDto } from './dto/login.dto';
import { VerifyOtpDto } from './dto/verifyOtp.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

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
  @Get('/logout')
  async logout(@Req() req: Request) {
    await this.authService.logout(req.credentials);
    return { message: 'Logged out successfully' };
  }

  @Post('/forget-password')
  async forgetPassword(@Body() dto: ForgetPasswordDTO) {
    await this.authService.forgetPassword(dto);
    return `reset password for this email}`;
  }
  @Get('/verify-otp')
  async verifyOTP(@Body() dto: VerifyOtpDto) {
    await this.authService.verifyOtp(dto);
  }
}
