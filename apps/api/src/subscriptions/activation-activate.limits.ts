import type { RateLimitRule } from '../auth/decorators/rate-limit.decorator';

/**
 * Distinct INVALID_CODE vs CODE_ALREADY_USED would otherwise let attackers
 * enumerate codes — keep activate attempts tightly limited per IP / user / company.
 */
export const SUBSCRIPTION_ACTIVATE_RATE_LIMITS = [
  { name: 'subscription-activate-ip', limit: 30, windowSeconds: 15 * 60, by: 'ip' },
  { name: 'subscription-activate-user', limit: 10, windowSeconds: 15 * 60, by: 'user' },
  { name: 'subscription-activate-company', limit: 20, windowSeconds: 15 * 60, by: 'company' },
] as const satisfies readonly RateLimitRule[];
