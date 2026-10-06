import { SetMetadata } from '@nestjs/common';

export type RateLimitRule = {
  /** Namespaces the Redis key, e.g. "login". */
  name: string;
  limit: number;
  windowSeconds: number;
  /**
   * - ip: client IP
   * - ip+email: IP + body.email (login/signup)
   * - user: authenticated user id (JWT)
   * - company: authenticated company id (JWT)
   */
  by: 'ip' | 'ip+email' | 'user' | 'company';
};

export const RATE_LIMIT_KEY = 'rateLimit';

export const RateLimit = (...rules: RateLimitRule[]) => SetMetadata(RATE_LIMIT_KEY, rules);
