export const ACCESS_COOKIE = 'skladnik_access';
export const REFRESH_COOKIE = 'skladnik_refresh';
export const ACCESS_EXPIRES = '15m';
export const REFRESH_EXPIRES = '7d';
export const REFRESH_TTL_SECONDS = 60 * 60 * 24 * 7;
export const ACCESS_TTL_SECONDS = 60 * 15;
/** Password-reset links expire after one hour. */
export const RESET_TTL_SECONDS = 60 * 60;

export function refreshRedisKey(jti: string) {
  return `auth:refresh:${jti}`;
}

export function resetRedisKey(token: string) {
  return `auth:reset:${token}`;
}

/** Tracks refresh JTIs for a user so password reset can revoke every session. */
export function sessionSetKey(userId: string) {
  return `auth:sessions:${userId}`;
}
