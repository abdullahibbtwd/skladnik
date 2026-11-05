/** Tenant roles from prisma `UserRole` / `@skladnik/shared`. */
export const GUIDE_ROLES = ['OWNER', 'SITE_MANAGER', 'STAFF', 'ACCOUNTANT', 'CASHIER'] as const;
export type GuideRole = (typeof GUIDE_ROLES)[number];

export type RoleCredentials = { email: string; password: string };

/**
 * Default local demo accounts. Override per role with:
 *   GUIDE_EMAIL / GUIDE_PASSWORD  (applies to the selected role)
 * or role-specific:
 *   GUIDE_OWNER_EMAIL / GUIDE_OWNER_PASSWORD
 *   GUIDE_SITE_MANAGER_EMAIL / …
 *
 * Local demo passwords were set to GuideOwner1! for screenshot runs.
 */
const DEFAULTS: Record<GuideRole, RoleCredentials> = {
  OWNER: {
    email: process.env.GUIDE_OWNER_EMAIL ?? 'demo-owner@skladnik.dev',
    password: process.env.GUIDE_OWNER_PASSWORD ?? 'GuideOwner1!',
  },
  SITE_MANAGER: {
    email: process.env.GUIDE_SITE_MANAGER_EMAIL ?? 'demo-manager@skladnik.dev',
    password: process.env.GUIDE_SITE_MANAGER_PASSWORD ?? 'GuideOwner1!',
  },
  STAFF: {
    email: process.env.GUIDE_STAFF_EMAIL ?? 'demo-storekeeper@skladnik.dev',
    password: process.env.GUIDE_STAFF_PASSWORD ?? 'GuideOwner1!',
  },
  ACCOUNTANT: {
    email: process.env.GUIDE_ACCOUNTANT_EMAIL ?? 'demo-accountant@skladnik.dev',
    password: process.env.GUIDE_ACCOUNTANT_PASSWORD ?? 'GuideOwner1!',
  },
  CASHIER: {
    email: process.env.GUIDE_CASHIER_EMAIL ?? 'demo-cashier@skladnik.dev',
    password: process.env.GUIDE_CASHIER_PASSWORD ?? 'GuideOwner1!',
  },
};

export function parseRole(raw: string | undefined): GuideRole {
  const value = (raw ?? 'OWNER').trim().toUpperCase();
  if ((GUIDE_ROLES as readonly string[]).includes(value)) return value as GuideRole;
  throw new Error(`Unknown GUIDE_ROLE="${raw}". Use one of: ${GUIDE_ROLES.join(', ')}`);
}

export function credentialsForRole(role: GuideRole): RoleCredentials {
  const base = DEFAULTS[role];
  const email = process.env.GUIDE_EMAIL?.trim() || base.email;
  const password = process.env.GUIDE_PASSWORD?.trim() || base.password;
  if (!email || !password) {
    throw new Error(
      `Missing credentials for ${role}. Set GUIDE_EMAIL/GUIDE_PASSWORD or GUIDE_${role}_EMAIL / GUIDE_${role}_PASSWORD.`,
    );
  }
  return { email, password };
}
