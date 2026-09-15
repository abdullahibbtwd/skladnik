export const USER_ROLES = ['OWNER', 'SITE_MANAGER', 'STAFF', 'ACCOUNTANT'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const COMPANY_WIDE_ROLES: readonly UserRole[] = ['OWNER', 'ACCOUNTANT'];

export function isCompanyWideRole(role: UserRole): boolean {
  return COMPANY_WIDE_ROLES.includes(role);
}

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  companyId: string;
  siteIds: string[];
  allSites: boolean;
};

export const APP_NAME = 'skladnik';
