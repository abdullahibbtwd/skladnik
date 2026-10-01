import {
  canSeeFinancials,
  canUsePos,
  isCompanyWideRole,
  isOperationalManager,
  isSalesManager,
  canAdjustProductMinStock,
  canWriteProductCatalog,
  type UserRole,
} from '@skladnik/shared';
import { useAuthRole } from './auth-store';

/** What the UI offers each role; mirrors the API's role checks so nobody is shown a screen that would refuse them. */
export function permissionsFor(role: UserRole | null | undefined) {
  const operational = isOperationalManager(role);
  const financial = isSalesManager(role);
  const companyWide = Boolean(role && isCompanyWideRole(role));
  const accountant = role === 'ACCOUNTANT';
  return {
    /** Receive, write-off, invoice scans and photo queue. Staff included (SKL-07: not CASHIER). ACC-01: no Accountant. */
    createDocuments: operational || role === 'STAFF',
    /** SKL-07: POS / sales write — operational managers + CASHIER; ACC-01: no Accountant. */
    pos: canUsePos(role),
    /** Read sales list / receipts / daily report (includes Accountant). */
    salesRead: canUsePos(role) || accountant,
    /** Transfer and stocktake — operational managers only (CASHIER F-02 / ACC-01). */
    stockOps: operational,
    /** Reorder / order suggestions — everyone except read-only Accountant. */
    reorder: Boolean(role && !accountant),
    /** Purchase cost, stock value, margins and document money (CASHIER F-04). Accountant keeps these. */
    seeFinancials: canSeeFinancials(role),
    /** Recipes — operational managers only (ACC-01). */
    manage: operational,
    /** Reports hub / CSV / Excel — financial managers including Accountant. */
    reports: financial,
    vat: companyWide,
    editLayouts: companyWide,
    /** Bulk ZIP of original document photos/PDFs. */
    documentArchive: companyWide,
    audit: companyWide,
    /** View company profile, numbering, print template and expiry thresholds. */
    companySettings: companyWide,
    /** Edit company / numbering / stock rules — Owner only (ACC-01). */
    companySettingsWrite: role === 'OWNER',
    /** Who may charge a different price at the till. */
    priceRules: role === 'OWNER',
    /** Groups, partners and units settings write (ACC-01: Owner only; Accountant does not see tabs). */
    masterData: role === 'OWNER',
    /** Full product catalog create/edit/archive. */
    productCatalog: canWriteProductCatalog(role),
    /** Change only the reorder minimum on a product (site managers: own site via ProductSiteMin). */
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
