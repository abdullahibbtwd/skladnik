import { Body, Controller, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { User } from '@prisma/client';
import type { Request, Response } from 'express';
import type { AuthUser } from '@skladnik/shared';
import { AuthService } from './auth.service';
import { REFRESH_COOKIE } from './auth.constants';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import { RateLimit, type RateLimitRule } from './decorators/rate-limit.decorator';
import { LoginDto } from './dto/login.dto';
import { SignupDto } from './dto/signup.dto';
import { SignupWithInviteDto } from './dto/signup-with-invite.dto';
import { RateLimitGuard } from './guards/rate-limit.guard';
import { InvitesService } from '../invites/invites.service';

const SIGNUP_LIMIT: RateLimitRule = { name: 'signup', limit: 10, windowSeconds: 60 * 60, by: 'ip' };

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly invites: InvitesService,
  ) {}

  @Public()
  @UseGuards(RateLimitGuard)
  @RateLimit(SIGNUP_LIMIT)
  @Post('signup')
  signup(@Body() dto: SignupDto, @Res({ passthrough: true }) res: Response) {
    return this.auth.signup(dto, res);
  }

  @Public()
  @UseGuards(RateLimitGuard)
  @RateLimit(SIGNUP_LIMIT)
  @Post('signup-with-invite')
  async signupWithInvite(@Body() dto: SignupWithInviteDto, @Res({ passthrough: true }) res: Response) {
    const user = await this.invites.accept(dto);
    return this.auth.issueSession(user, res, 'SIGNUP');
  }

  @Public()
  @UseGuards(RateLimitGuard, AuthGuard('local'))
  @RateLimit(
    { name: 'login-ip', limit: 30, windowSeconds: 15 * 60, by: 'ip' },
    { name: 'login', limit: 10, windowSeconds: 15 * 60, by: 'ip+email' },
  )
  @Post('login')
  login(
    @Body() _dto: LoginDto,
    @Req() req: Request & { user: User },
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.auth.login(req.user, res);
  }

  @Public()
  @Post('refresh')
  refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.auth.refresh(req.cookies?.[REFRESH_COOKIE], res);
  }

  @Public()
  @Post('logout')
  logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.auth.logout(req.cookies?.[REFRESH_COOKIE], res);
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user);
  }
}
