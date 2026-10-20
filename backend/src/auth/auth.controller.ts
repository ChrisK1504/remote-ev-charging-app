import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import { AuthService } from './auth.service';
import * as authTypes from './auth.types';
import express from 'express';

declare module 'express-session' {
  interface SessionData {
    userId?: string;
  }
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(200)
  async login(
    @Body() credentials: authTypes.LoginDto,
    @Req() request: express.Request,
  ) {
    const user = await this.authService.login(credentials);

    await new Promise<void>((resolve, reject) => {
      request.session.regenerate((err) => {
        if (err) {
          reject(err as Error);
          return;
        }
        resolve();
      });
    });

    request.session.userId = user.id;

    await new Promise<void>((resolve, reject) => {
      request.session.save((err) => {
        if (err) {
          reject(err as Error);
          return;
        }
        resolve();
      });
    });

    return user;
  }

  @Get('me')
  async getMe(@Req() request: express.Request) {
    const currentUserId = request.session.userId;
    return this.authService.getCurrentUser(currentUserId);
  }

  @Post('logout')
  @HttpCode(204)
  async logout(
    @Req() request: express.Request,
    @Res({ passthrough: true }) response: express.Response,
  ) {
    await new Promise<void>((resolve, reject) => {
      request.session.destroy((err) => {
        if (err) {
          reject(err as Error);
          return;
        }
        resolve();
      });
    });

    response.clearCookie('connect.sid', { path: '/' });
  }
}
