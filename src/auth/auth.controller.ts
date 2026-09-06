import { Body, Controller, Post, Res } from '@nestjs/common';
import { type Response } from 'express';

import { COOKIE_OPTION } from '../config/cookie';

import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';

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
}
