import { SetMetadata } from '@nestjs/common';

/** Every HTTP handler must resolve to exactly one of these (class or method metadata). */
export const AUTH_REALM_KEY = 'authRealm';
export type AuthRealm = 'public' | 'tenant' | 'platform';

/** Unauthenticated routes (health, tenant login, platform login / TOTP pending). */
export const Public = () => SetMetadata(AUTH_REALM_KEY, 'public' satisfies AuthRealm);

/** Tenant JWT required (`skladnik_access`, audience skladnik-tenant). */
export const Tenant = () => SetMetadata(AUTH_REALM_KEY, 'tenant' satisfies AuthRealm);

/** Platform admin JWT required (`skladnik_platform_access`, audience skladnik-platform). */
export const Platform = () => SetMetadata(AUTH_REALM_KEY, 'platform' satisfies AuthRealm);

/** @deprecated Prefer AUTH_REALM_KEY / AuthRealm. Kept for any leftover checks. */
export const IS_PUBLIC_KEY = 'isPublic';
