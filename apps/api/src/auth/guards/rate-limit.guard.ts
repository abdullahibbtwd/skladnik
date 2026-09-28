import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import { RedisService } from '../../redis/redis.service';
import { RATE_LIMIT_KEY, type RateLimitRule } from '../decorators/rate-limit.decorator';

/** Fixed-window counters in Redis, so limits hold across API instances and restarts. */
@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly redis: RedisService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const rules = this.reflector.get<RateLimitRule[] | undefined>(RATE_LIMIT_KEY, context.getHandler());
    if (!rules?.length) return true;

    const req = context.switchToHttp().getRequest<Request>();
    const ip = req.ip ?? 'unknown';
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';

    for (const rule of rules) {
      const subject = rule.by === 'ip+email' ? `${ip}:${email}` : ip;
      const key = `rl:${rule.name}:${subject}`;
      const result = await this.redis.client.multi().incr(key).expire(key, rule.windowSeconds, 'NX').ttl(key).exec();
      const count = Number(result?.[0]?.[1] ?? 0);
      if (count <= rule.limit) continue;

      const retryAfter = Math.max(1, Number(result?.[2]?.[1] ?? rule.windowSeconds));
      context.switchToHttp().getResponse<Response>().setHeader('Retry-After', String(retryAfter));
      const minutes = Math.ceil(retryAfter / 60);
      throw new HttpException(
        `Too many attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return true;
  }
}
