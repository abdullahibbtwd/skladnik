import { SetMetadata } from '@nestjs/common';

export type RateLimitRule = {
  /** Namespaces the Redis key, e.g. "login". */
  name: string;
  limit: number;
  windowSeconds: number;
  /** "ip+email" keys on the lower-cased `email` in the body as well. */
  by: 'ip' | 'ip+email';
};

export const RATE_LIMIT_KEY = 'rateLimit';

export const RateLimit = (...rules: RateLimitRule[]) => SetMetadata(RATE_LIMIT_KEY, rules);
