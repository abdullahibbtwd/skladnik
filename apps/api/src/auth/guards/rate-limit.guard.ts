import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import type { AuthUser } from '@skladnik/shared';
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

    const req = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const ip = req.ip ?? 'unknown';
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const userId = req.user?.id ?? '';
    const companyId = req.user?.companyId ?? '';

    for (const rule of rules) {
      const subject = subjectFor(rule.by, { ip, email, userId, companyId });
      if (!subject) continue;
      const key = `rl:${rule.name}:${subject}`;
      if (this.redis.client.status === 'wait') {
        await this.redis.client.connect();
      }
      const result = await this.redis.client.multi().incr(key).expire(key, rule.windowSeconds, 'NX').ttl(key).exec();
      const count = Number(result?.[0]?.[1] ?? 0);
      if (count <= rule.limit) continue;

      const retryAfter = Math.max(1, Number(result?.[2]?.[1] ?? rule.windowSeconds));
      context.switchToHttp().getResponse<Response>().setHeader('Retry-After', String(retryAfter));
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          error: 'Too Many Requests',
          code: 'RATE_LIMITED',
          message: 'Too many attempts. Try again later.',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return true;
  }
}

function subjectFor(
  by: RateLimitRule['by'],
  ctx: { ip: string; email: string; userId: string; companyId: string },
): string | null {
  switch (by) {
    case 'ip':
      return ctx.ip;
    case 'ip+email':
      return `${ctx.ip}:${ctx.email}`;
    case 'user':
      return ctx.userId || null;
    case 'company':
      return ctx.companyId || null;
    default:
      return null;
  }
}
