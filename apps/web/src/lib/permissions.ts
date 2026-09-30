import {
  canSeeFinancials,
  isCompanyWideRole,
  isSalesManager,
  canAdjustProductMinStock,
  canWriteProductCatalog,
  type UserRole,
} from '@skladnik/shared';
import { useAuthRole } from './auth-store';

/** What the UI offers each role; mirrors the API's role checks so nobody is shown a screen that would refuse them. */
export function permissionsFor(role: UserRole | null | undefined) {
  const manager = isSalesManager(role);
  const companyWide = Boolean(role && isCompanyWideRole(role));
  return {
    /** Receive, write-off, invoice scans and photo queue. Staff included (CASHIER F-01). */
    createDocuments: manager || role === 'STAFF',
    /** Transfer and stocktake — manager only (CASHIER F-02). */
    stockOps: manager,
    /** Purchase cost, stock value, margins and document money (CASHIER F-04). */
    seeFinancials: canSeeFinancials(role),
    /** Recipes, reports, margins and costs. */
    manage: manager,
    vat: companyWide,
    editLayouts: companyWide,
    /** Bulk ZIP of original document photos/PDFs. */
    documentArchive: companyWide,
    audit: companyWide,
    /** Company profile, numbering, print template and expiry thresholds. */
    companySettings: companyWide,
    /** Who may charge a different price at the till. */
    priceRules: role === 'OWNER',
    /** Groups, partners and units settings. */
    masterData: companyWide,
    /** Full product catalog create/edit/archive. */
    productCatalog: canWriteProductCatalog(role),
    /** Change only the reorder minimum on a product. */
    productMinStock: canAdjustProductMinStock(role),
    /** Opening stock is Owner-only (and locks after the site's first real document). */
    openingStock: role === 'OWNER',
    users: role === 'OWNER',
  };
}

export type Permissions = ReturnType<typeof permissionsFor>;
export type Permission = keyof Permissions;

export function usePermissions(): Permissions {
  return permissionsFor(useAuthRole());
}
