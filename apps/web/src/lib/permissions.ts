import { isCompanyWideRole, isSalesManager, type UserRole } from '@skladnik/shared';
import { useAuthRole } from './auth-store';

/** What the UI offers each role; mirrors the API's role checks so nobody is shown a screen that would refuse them. */
export function permissionsFor(role: UserRole | null | undefined) {
  const manager = isSalesManager(role);
  const companyWide = Boolean(role && isCompanyWideRole(role));
  return {
    /** Receive, write-off, transfer, stocktake, opening stock and invoice scans. */
    createDocuments: manager,
    /** Recipes, reports, margins and costs. */
    manage: manager,
    vat: companyWide,
    editLayouts: companyWide,
    audit: companyWide,
    /** Groups, partners and units settings. */
    masterData: companyWide,
    users: role === 'OWNER',
  };
}

export type Permissions = ReturnType<typeof permissionsFor>;
export type Permission = keyof Permissions;

export function usePermissions(): Permissions {
  return permissionsFor(useAuthRole());
}
