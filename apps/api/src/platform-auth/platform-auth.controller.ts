import { Body, Controller, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Public } from '../auth/decorators/public.decorator';
import { RateLimit } from '../auth/decorators/rate-limit.decorator';
import { RateLimitGuard } from '../auth/guards/rate-limit.guard';
import { Platform } from '../auth/decorators/auth-realm.decorator';
import { CurrentPlatformAdmin } from './decorators/current-platform-admin.decorator';
import { PlatformLoginDto } from './dto/platform-login.dto';
import { PlatformTotpCodeDto } from './dto/platform-totp-code.dto';
import {
  PLATFORM_PENDING_COOKIE,
  PLATFORM_REFRESH_COOKIE,
} from './platform-auth.constants';
import { PlatformAuthService } from './platform-auth.service';
import type { PlatformAuthUser } from './platform-auth.types';

@Controller('platform-auth')
export class PlatformAuthController {
  constructor(private readonly auth: PlatformAuthService) {}

  @Public()
  @UseGuards(RateLimitGuard)
  @RateLimit(
    { name: 'platform-login-ip', limit: 30, windowSeconds: 15 * 60, by: 'ip' },
    { name: 'platform-login', limit: 10, windowSeconds: 15 * 60, by: 'ip+email' },
  )
  @Post('login')
  login(@Body() dto: PlatformLoginDto, @Res({ passthrough: true }) res: Response) {
    return this.auth.login(dto.email, dto.password, res);
  }

  @Public()
  @UseGuards(RateLimitGuard)
  @RateLimit({ name: 'platform-totp', limit: 20, windowSeconds: 15 * 60, by: 'ip' })
  @Post('totp/verify')
  verifyTotp(
    @Body() dto: PlatformTotpCodeDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.auth.verifyTotp(dto.code, req.cookies?.[PLATFORM_PENDING_COOKIE], res);
  }

  @Public()
  @Post('totp/enroll')
  enroll(@Req() req: Request) {
    return this.auth.beginEnroll(req.cookies?.[PLATFORM_PENDING_COOKIE]);
  }

  @Public()
  @UseGuards(RateLimitGuard)
  @RateLimit({ name: 'platform-totp-confirm', limit: 20, windowSeconds: 15 * 60, by: 'ip' })
  @Post('totp/confirm')
  confirmEnroll(
    @Body() dto: PlatformTotpCodeDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.auth.confirmEnroll(dto.code, req.cookies?.[PLATFORM_PENDING_COOKIE], res);
  }

  @Public()
  @Post('refresh')
  refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.auth.refresh(req.cookies?.[PLATFORM_REFRESH_COOKIE], res);
  }

  @Public()
  @Post('logout')
  logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.auth.logout(req.cookies?.[PLATFORM_REFRESH_COOKIE], res);
  }

  @Platform()
  @Get('me')
  me(@CurrentPlatformAdmin() admin: PlatformAuthUser) {
    return this.auth.me(admin);
  }
}
