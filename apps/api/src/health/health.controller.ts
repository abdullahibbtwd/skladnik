import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Public } from '../auth/decorators/public.decorator';
import { HealthService } from './health.service';

@Public()
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get('live')
  live() {
    return { status: 'ok' };
  }

  @Get()
  async check(@Res({ passthrough: true }) res: Response) {
    const result = await this.health.check();
    if (result.status !== 'ok') {
      res.status(503);
    }
    return result;
  }
}
