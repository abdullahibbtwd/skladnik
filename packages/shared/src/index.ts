export const USER_ROLES = ['OWNER', 'SITE_MANAGER', 'STAFF', 'ACCOUNTANT'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const COMPANY_WIDE_ROLES: readonly UserRole[] = ['OWNER', 'ACCOUNTANT'];

export function isCompanyWideRole(role: UserRole): boolean {
  return COMPANY_WIDE_ROLES.includes(role);
}

export const SITE_TYPES = ['STORE', 'KITCHEN', 'BAR', 'WAREHOUSE'] as const;
export type SiteType = (typeof SITE_TYPES)[number];

export const ROLE_LABELS: Record<UserRole, string> = {
  OWNER: 'Owner',
  SITE_MANAGER: 'Site manager',
  STAFF: 'Staff',
  ACCOUNTANT: 'Accountant',
};

export const SITE_TYPE_LABELS: Record<SiteType, string> = {
  STORE: 'Store',
  KITCHEN: 'Kitchen',
  BAR: 'Bar',
  WAREHOUSE: 'Warehouse',
};

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  companyId: string;
  siteIds: string[];
  allSites: boolean;
};

export const DOCUMENT_TYPES = ['INVOICE', 'PROTOCOL', 'RECEIPT', 'CREDIT_NOTE'] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  INVOICE: 'Purchase invoice',
  PROTOCOL: 'Goods handover / dispatch',
  RECEIPT: 'Goods receipt note',
  CREDIT_NOTE: 'Credit / debit note',
};

export const DOCUMENT_TYPE_LABELS_BG: Record<DocumentType, string> = {
  INVOICE: 'Търговски документ',
  PROTOCOL: 'Складова разписка — Изписване',
  RECEIPT: 'Стокова разписка',
  CREDIT_NOTE: 'Кредитно / дебитно известие',
};

export const DOCUMENT_STATUSES = ['DRAFT', 'REVIEW', 'POSTED', 'CANCELLED'] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

export const DOCUMENT_STATUS_LABELS: Record<DocumentStatus, string> = {
  DRAFT: 'Draft',
  REVIEW: 'Review',
  POSTED: 'Posted',
  CANCELLED: 'Cancelled',
};

export const STOCK_DIRECTIONS = ['IN', 'OUT'] as const;
export type StockDirection = (typeof STOCK_DIRECTIONS)[number];

export function defaultStockDirection(type: DocumentType): StockDirection {
  return type === 'PROTOCOL' ? 'OUT' : 'IN';
}

export const PRODUCT_STATUSES = ['ACTIVE', 'PENDING_REVIEW', 'ARCHIVED'] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

export const PRODUCT_STATUS_LABELS: Record<ProductStatus, string> = {
  ACTIVE: 'Active',
  PENDING_REVIEW: 'Pending review',
  ARCHIVED: 'Archived',
};

export const PARTNER_KINDS = ['SUPPLIER', 'CUSTOMER', 'BOTH'] as const;
export type PartnerKind = (typeof PARTNER_KINDS)[number];

export const PARTNER_KIND_LABELS: Record<PartnerKind, string> = {
  SUPPLIER: 'Supplier',
  CUSTOMER: 'Customer',
  BOTH: 'Both',
};

export const MASTER_DATA_WRITE_ROLES: readonly UserRole[] = ['OWNER', 'ACCOUNTANT'];
export const PRODUCT_WRITE_ROLES: readonly UserRole[] = ['OWNER', 'ACCOUNTANT', 'SITE_MANAGER'];

export function canWriteMasterData(role: UserRole | null | undefined): boolean {
  return Boolean(role && MASTER_DATA_WRITE_ROLES.includes(role));
}

export function canWriteProducts(role: UserRole | null | undefined): boolean {
  return Boolean(role && PRODUCT_WRITE_ROLES.includes(role));
}

export const UNITS_OF_MEASURE = ['PCS', 'PACK', 'KG', 'CASE', 'CARTON', 'JAR', 'OTHER'] as const;
export type UnitOfMeasure = (typeof UNITS_OF_MEASURE)[number];

export const UNIT_LABELS: Record<UnitOfMeasure, string> = {
  PCS: 'pcs',
  PACK: 'pack',
  KG: 'kg',
  CASE: 'case',
  CARTON: 'carton',
  JAR: 'jar',
  OTHER: 'other',
};

/** Raw strings printed on Bulgarian invoices → canonical unit. Seeded per company. */
export const DEFAULT_UNIT_ALIASES: readonly { raw: string; unit: UnitOfMeasure }[] = [
  { raw: 'бр', unit: 'PCS' },
  { raw: 'бр.', unit: 'PCS' },
  { raw: 'брой', unit: 'PCS' },
  { raw: 'pcs', unit: 'PCS' },
  { raw: 'пак', unit: 'PACK' },
  { raw: 'пакет', unit: 'PACK' },
  { raw: 'pack', unit: 'PACK' },
  { raw: 'кг', unit: 'KG' },
  { raw: 'kg', unit: 'KG' },
  { raw: 'килограм', unit: 'KG' },
  { raw: 'стек', unit: 'CASE' },
  { raw: 'стека', unit: 'CASE' },
  { raw: 'кашон', unit: 'CARTON' },
  { raw: 'кашона', unit: 'CARTON' },
  { raw: 'буркан', unit: 'JAR' },
];

export const APP_NAME = 'skladnik';

export const CAPTURE_EXTRACTION_STATUSES = ['IDLE', 'QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED'] as const;
export type CaptureExtractionStatus = (typeof CAPTURE_EXTRACTION_STATUSES)[number];

