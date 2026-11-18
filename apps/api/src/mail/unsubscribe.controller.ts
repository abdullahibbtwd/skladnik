import {
  Body,
  Controller,
  Get,
  Header,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Public } from '../auth/decorators/public.decorator';
import { RateLimit, type RateLimitRule } from '../auth/decorators/rate-limit.decorator';
import { RateLimitGuard } from '../auth/guards/rate-limit.guard';
import { UnsubscribeService } from './unsubscribe.service';

const UNSUB_LIMIT: RateLimitRule = {
  name: 'marketing-unsubscribe',
  limit: 30,
  windowSeconds: 60 * 60,
  by: 'ip',
};

@Controller('public/unsubscribe')
export class UnsubscribeController {
  constructor(private readonly unsubscribe: UnsubscribeService) {}

  /** Confirmation page — does not opt out until POST (avoids prefetch scanners). */
  @Public()
  @UseGuards(RateLimitGuard)
  @RateLimit(UNSUB_LIMIT)
  @Get()
  @Header('Content-Type', 'text/html; charset=utf-8')
  async confirm(@Query('token') token: string | undefined, @Res() res: Response) {
    const page = await this.unsubscribe.pageForToken(token);
    return res.status(page.status).send(page.html);
  }

  /**
   * Perform opt-out. Accepts form POST (token field), query token, or
   * RFC 8058 One-Click body `List-Unsubscribe=One-Click` with token in query.
   */
  @Public()
  @UseGuards(RateLimitGuard)
  @RateLimit(UNSUB_LIMIT)
  @Post()
  @Header('Content-Type', 'text/html; charset=utf-8')
  async submit(
    @Query('token') queryToken: string | undefined,
    @Body() body: Record<string, unknown> | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const bodyToken = typeof body?.token === 'string' ? body.token : undefined;
    const token = bodyToken || queryToken;
    const page = await this.unsubscribe.optOut(token);
    // One-Click clients expect 200; HTML body is fine for humans too.
    void req;
    return res.status(page.status).send(page.html);
  }
}
