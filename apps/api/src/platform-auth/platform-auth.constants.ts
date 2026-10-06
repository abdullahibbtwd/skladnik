/** Platform-admin auth realm — separate cookies, secrets, and JWT audience from tenants. */

export const PLATFORM_ACCESS_COOKIE = 'skladnik_platform_access';
export const PLATFORM_REFRESH_COOKIE = 'skladnik_platform_refresh';
/** Short-lived cookie after password, before TOTP verify / enroll. */
export const PLATFORM_PENDING_COOKIE = 'skladnik_platform_pending';

export const PLATFORM_ACCESS_TTL_SECONDS = 60 * 15;
export const PLATFORM_REFRESH_TTL_SECONDS = 60 * 60 * 24 * 7;
export const PLATFORM_PENDING_TTL_SECONDS = 60 * 10;

export const PLATFORM_JWT_ISSUER = 'skladnik-api';
export const PLATFORM_JWT_AUDIENCE = 'skladnik-platform';
/** Tenant access tokens use this audience so they cannot pass the platform strategy. */
export const TENANT_JWT_AUDIENCE = 'skladnik-tenant';

export const PLATFORM_JWT_STRATEGY = 'platform-jwt';

export function platformRefreshRedisKey(jti: string) {
  return `platform:auth:refresh:${jti}`;
}

export function platformSessionSetKey(adminId: string) {
  return `platform:auth:sessions:${adminId}`;
}
