export const USER_ROLES = ['OWNER', 'SITE_MANAGER', 'STAFF', 'ACCOUNTANT', 'CASHIER'] as const;
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
  // SKL-07 product decision: separate CASHIER ("Касиер") — POS only; STAFF loses till access.
  CASHIER: 'Cashier',
};

export const ROLE_LABELS_BG: Record<UserRole, string> = {
  OWNER: 'Собственик',
  SITE_MANAGER: 'Мениджър на обекта',
  STAFF: 'Персонал',
  ACCOUNTANT: 'Счетоводител',
  CASHIER: 'Касиер',
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

export const DOCUMENT_TYPES = [
  'INVOICE',
  'PROTOCOL',
  'RECEIPT',
  'CREDIT_NOTE',
  'TRANSFER',
  'STOCKTAKE',
  'OPENING_BALANCE',
  'SALE',
  'WRITE_OFF',
] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

/** Paper forms a supplier or customer hands over: these can be photographed and read by OCR. */
export const PAPER_DOCUMENT_TYPES = ['INVOICE', 'PROTOCOL', 'RECEIPT', 'CREDIT_NOTE'] as const;
export type PaperDocumentType = (typeof PAPER_DOCUMENT_TYPES)[number];

/** Internal stock operations with their own screens; their type can't be changed after creation. */
export const STOCK_OPERATION_TYPES = ['TRANSFER', 'STOCKTAKE', 'OPENING_BALANCE', 'WRITE_OFF'] as const;
export type StockOperationType = (typeof STOCK_OPERATION_TYPES)[number];

export function isPaperDocumentType(type: DocumentType): type is PaperDocumentType {
  return (PAPER_DOCUMENT_TYPES as readonly string[]).includes(type);
}

export function isStockOperationType(type: DocumentType): type is StockOperationType {
  return (STOCK_OPERATION_TYPES as readonly string[]).includes(type);
}

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  INVOICE: 'Purchase invoice',
  PROTOCOL: 'Goods handover / dispatch',
  RECEIPT: 'Goods receipt note',
  CREDIT_NOTE: 'Credit / debit note',
  TRANSFER: 'Transfer between sites',
  STOCKTAKE: 'Stocktake',
  OPENING_BALANCE: 'Opening stock',
  SALE: 'Sale',
  WRITE_OFF: 'Write-off',
};

export const DOCUMENT_TYPE_LABELS_BG: Record<DocumentType, string> = {
  INVOICE: 'Търговски документ',
  PROTOCOL: 'Складова разписка — Изписване',
  RECEIPT: 'Стокова разписка',
  CREDIT_NOTE: 'Кредитно / дебитно известие',
  TRANSFER: 'Вътрешно преместване',
  STOCKTAKE: 'Инвентаризация',
  OPENING_BALANCE: 'Начални наличности',
  SALE: 'Продажба',
  WRITE_OFF: 'Протокол за брак',
};

/** Sales are recorded at the till only; the document editor never creates or edits them. */
export function isTillDocumentType(type: DocumentType): type is 'SALE' {
  return type === 'SALE';
}

export const PAYMENT_METHODS = ['CASH', 'CARD'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/** Business days (daily sales report, sale numbers) follow Bulgarian local time. */
export const BUSINESS_TIME_ZONE = 'Europe/Sofia';

/**
 * Financial visibility, reports, VAT and margins.
 * ACC-01: ACCOUNTANT stays here for read/export; mutating ops use OPERATIONAL_MANAGER_ROLES.
 */
export const SALES_MANAGER_ROLES: readonly UserRole[] = ['OWNER', 'ACCOUNTANT', 'SITE_MANAGER'];

export function isSalesManager(role: UserRole | null | undefined): boolean {
  return Boolean(role && SALES_MANAGER_ROLES.includes(role));
}

/**
 * ACC-01 product decision: Accountant is read-only — no till, documents, master-data or stock writes.
 * Separation of duties setting skipped (no "втори човек за осчетоводяване").
 */
export const OPERATIONAL_MANAGER_ROLES: readonly UserRole[] = ['OWNER', 'SITE_MANAGER'];

export function isOperationalManager(role: UserRole | null | undefined): boolean {
  return Boolean(role && OPERATIONAL_MANAGER_ROLES.includes(role));
}

export function isAccountant(role: UserRole | null | undefined): boolean {
  return role === 'ACCOUNTANT';
}

/**
 * SKL-07: roles that may open the till and record sales.
 * Product decision: STAFF loses POS; only CASHIER (and operational managers) sell.
 * ACC-01: Accountant removed from the till.
 */
export const POS_ROLES: readonly UserRole[] = ['OWNER', 'SITE_MANAGER', 'CASHIER'];

/** List / report / open a sale receipt (includes read-only Accountant). */
export const SALES_READ_ROLES: readonly UserRole[] = ['OWNER', 'ACCOUNTANT', 'SITE_MANAGER', 'CASHIER'];

export function canUsePos(role: UserRole | null | undefined): boolean {
  return Boolean(role && (POS_ROLES as readonly string[]).includes(role));
}

export function canReadSales(role: UserRole | null | undefined): boolean {
  return Boolean(role && (SALES_READ_ROLES as readonly string[]).includes(role));
}

/** Cashier (and former Staff sales scope): list/report limited to own tickets. */
export function seesOwnSalesOnly(role: UserRole | null | undefined): boolean {
  return role === 'CASHIER';
}

/**
 * Purchase cost, stock value, margins and document money.
 * CASHIER F-04: Staff keeps selling price (POS) but never cost / value / supplier prices.
 */
export function canSeeFinancials(role: UserRole | null | undefined): boolean {
  return isSalesManager(role);
}

/** Full partner directory (tax IDs, contacts). Staff uses GET /partners/lookup (id + name only). */
export const PARTNER_DIRECTORY_ROLES: readonly UserRole[] = ['OWNER', 'ACCOUNTANT', 'SITE_MANAGER'];

export function canReadPartnerDirectory(role: UserRole | null | undefined): boolean {
  return Boolean(role && (PARTNER_DIRECTORY_ROLES as readonly string[]).includes(role));
}

/**
 * Document types Staff may create as drafts (goods receipt / photo capture) or write-offs.
 * Transfer, stocktake and opening stock stay manager-only.
 */
export const STAFF_DOCUMENT_CREATE_TYPES = ['INVOICE', 'PROTOCOL', 'RECEIPT', 'CREDIT_NOTE', 'WRITE_OFF'] as const;
export type StaffDocumentCreateType = (typeof STAFF_DOCUMENT_CREATE_TYPES)[number];

export function canStaffCreateDocumentType(type: DocumentType): boolean {
  return (STAFF_DOCUMENT_CREATE_TYPES as readonly string[]).includes(type);
}

/** Roles that post / cancel / reverse any document. ACC-01: Accountant excluded (read-only). */
export const DOCUMENT_MANAGER_ROLES: readonly UserRole[] = OPERATIONAL_MANAGER_ROLES;

export function isDocumentManager(role: UserRole | null | undefined): boolean {
  return isOperationalManager(role);
}

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

/** A transfer is OUT from the sending site's point of view; a stocktake's direction is decided per line. */
export function defaultStockDirection(type: DocumentType): StockDirection {
  return type === 'PROTOCOL' || type === 'TRANSFER' || type === 'SALE' || type === 'WRITE_OFF' ? 'OUT' : 'IN';
}

/** Required on a WRITE_OFF (протокол за брак), not allowed on any other type. */
export const WRITE_OFF_REASONS = ['EXPIRED', 'DAMAGED', 'SPOILED', 'LOST', 'OTHER'] as const;
export type WriteOffReason = (typeof WRITE_OFF_REASONS)[number];

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

/** ACC-01: Accountant no longer writes partners / groups / units. */
export const MASTER_DATA_WRITE_ROLES: readonly UserRole[] = ['OWNER'];
/** Create, edit catalog fields, archive, supplier codes — not site managers. ACC-01: no Accountant. */
export const PRODUCT_CATALOG_WRITE_ROLES: readonly UserRole[] = ['OWNER'];
/** @deprecated Prefer canWriteProductCatalog / canAdjustProductMinStock. */
export const PRODUCT_WRITE_ROLES: readonly UserRole[] = PRODUCT_CATALOG_WRITE_ROLES;
/** Site managers may only change the reorder minimum on an existing product. ACC-01: no Accountant. */
export const PRODUCT_MIN_STOCK_ROLES: readonly UserRole[] = ['OWNER', 'SITE_MANAGER'];

export function canWriteMasterData(role: UserRole | null | undefined): boolean {
  return Boolean(role && MASTER_DATA_WRITE_ROLES.includes(role));
}

export function canWriteProductCatalog(role: UserRole | null | undefined): boolean {
  return Boolean(role && PRODUCT_CATALOG_WRITE_ROLES.includes(role));
}

/** @deprecated Prefer canWriteProductCatalog. */
export function canWriteProducts(role: UserRole | null | undefined): boolean {
  return canWriteProductCatalog(role);
}

export function canAdjustProductMinStock(role: UserRole | null | undefined): boolean {
  return Boolean(role && PRODUCT_MIN_STOCK_ROLES.includes(role));
}

/**
 * CAF-02: create a product from a scanned invoice line.
 * Staff creates PENDING_REVIEW only. This does not grant catalog create/edit/archive.
 */
export const PENDING_PRODUCT_CREATE_ROLES: readonly UserRole[] = ['OWNER', 'SITE_MANAGER', 'STAFF'];

export function canCreatePendingProduct(role: UserRole | null | undefined): boolean {
  return Boolean(role && PENDING_PRODUCT_CREATE_ROLES.includes(role));
}

export const UNITS_OF_MEASURE = ['PCS', 'PACK', 'KG', 'L', 'CASE', 'CARTON', 'JAR', 'OTHER'] as const;
export type UnitOfMeasure = (typeof UNITS_OF_MEASURE)[number];

export const UNIT_LABELS: Record<UnitOfMeasure, string> = {
  PCS: 'pcs',
  PACK: 'pack',
  KG: 'kg',
  L: 'l',
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
  { raw: 'л', unit: 'L' },
  { raw: 'л.', unit: 'L' },
  { raw: 'литър', unit: 'L' },
  { raw: 'литра', unit: 'L' },
  { raw: 'l', unit: 'L' },
  { raw: 'стек', unit: 'CASE' },
  { raw: 'стека', unit: 'CASE' },
  { raw: 'кашон', unit: 'CARTON' },
  { raw: 'кашона', unit: 'CARTON' },
  { raw: 'буркан', unit: 'JAR' },
];

/** Above this a card would issue 10× what reaches the plate; almost certainly a typo. */
export const MAX_WASTAGE_PERCENT = 90;
export const DEFAULT_MARKUP_PERCENT = 200;

const roundTo = (value: number, places: number) => {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
};

/** Gross quantity issued from stock so that `net` is left after cleaning / cooking loss (wastage % of gross). */
export function grossQuantity(net: number, wastagePercent: number) {
  const wastage = Math.min(Math.max(wastagePercent, 0), MAX_WASTAGE_PERCENT);
  return roundTo(net / (1 - wastage / 100), 4);
}

/** Stock one sale line takes of an ingredient: its gross quantity scaled from the recipe yield to the portions sold. */
export function ingredientIssue(gross: number, yieldPortions: number, portions: number) {
  return roundTo((gross * portions) / (yieldPortions > 0 ? yieldPortions : 1), 3);
}

/** Shelf price (VAT included) that earns `markupPercent` on the cost, rounded up to the cent. 0 without a cost. */
export function suggestedPrice(costPerPortion: number, markupPercent: number, vatRate: number) {
  if (!(costPerPortion > 0)) return 0;
  return Math.ceil(roundTo(costPerPortion * (1 + markupPercent / 100) * (1 + vatRate / 100) * 100, 6)) / 100;
}

export type RecipeCostInput = {
  /** `unitCost` excludes VAT; 0 or less means no known cost. */
  ingredients: { quantity: number; wastagePercent: number; unitCost: number }[];
  yieldPortions: number;
  /** Per portion, VAT included. */
  sellingPrice: number;
  vatRate: number;
  markupPercent: number;
};

/** Cost per portion, margin and suggested price of a technological card. */
export function recipeCosting(input: RecipeCostInput) {
  const portions = input.yieldPortions > 0 ? input.yieldPortions : 1;
  const lines = input.ingredients.map((ingredient) => {
    const gross = grossQuantity(ingredient.quantity, ingredient.wastagePercent);
    const perPortion = roundTo(gross / portions, 4);
    const costed = ingredient.unitCost > 0;
    return { gross, perPortion, costed, cost: costed ? roundTo((gross / portions) * ingredient.unitCost, 4) : 0 };
  });
  const costPerPortion = roundTo(
    lines.reduce((sum, line) => sum + line.cost, 0),
    4,
  );
  const netPrice = roundTo(input.sellingPrice / (1 + input.vatRate / 100), 4);
  const profit = roundTo(netPrice - costPerPortion, 4);
  return {
    lines,
    costPerPortion,
    missingCosts: lines.filter((line) => !line.costed).length,
    netPrice,
    profit,
    marginPercent: netPrice > 0 ? roundTo((profit / netPrice) * 100, 1) : null,
    foodCostPercent: netPrice > 0 ? roundTo((costPerPortion / netPrice) * 100, 1) : null,
    suggestedPrice: suggestedPrice(costPerPortion, input.markupPercent, input.vatRate),
  };
}

export const APP_NAME = 'skladnik';

export const CAPTURE_EXTRACTION_STATUSES = ['IDLE', 'QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED'] as const;
export type CaptureExtractionStatus = (typeof CAPTURE_EXTRACTION_STATUSES)[number];


export * from './reports';
export * from './compliance';
export * from './vat';
export * from './annex38';
export * from './document-checks';
export * from './document-number';
export * from './tax-ids';
export * from './settings';
export * from './quantity';
export * from './recipe-units';
export * from './amount-in-words-bg';
