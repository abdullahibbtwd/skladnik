import type { DocumentType, StockDirection, UserRole } from './index';

// ─── Document numbering ─────────────────────────────────────────────────────

/** Documents the company issues itself. Supplier and customer paperwork keeps the number printed on it. */
export const DOCUMENT_SERIES = ['WRITE_OFF', 'TRANSFER', 'STOCKTAKE', 'OPENING_BALANCE', 'DISPATCH'] as const;
export type DocumentSeriesKey = (typeof DOCUMENT_SERIES)[number];

export const DEFAULT_SERIES_PREFIX: Record<DocumentSeriesKey, string> = {
  WRITE_OFF: 'ПБ-',
  TRANSFER: 'ВП-',
  STOCKTAKE: 'ИНВ-',
  OPENING_BALANCE: 'НН-',
  DISPATCH: 'СР-',
};

export const DEFAULT_SERIES_PADDING = 4;
export const MAX_SERIES_PADDING = 10;
export const MAX_SERIES_PREFIX_LENGTH = 20;

/** The series a new document takes its number from; null when the number is the one printed on the paper. */
export function seriesForDocument(type: DocumentType, direction: StockDirection): DocumentSeriesKey | null {
  switch (type) {
    case 'WRITE_OFF':
    case 'TRANSFER':
    case 'STOCKTAKE':
    case 'OPENING_BALANCE':
      return type;
    case 'PROTOCOL':
      return direction === 'OUT' ? 'DISPATCH' : null;
    default:
      return null;
  }
}

export function formatSeriesNumber(prefix: string, value: number, padding: number) {
  return `${prefix}${String(value).padStart(padding, '0')}`;
}

export type DocumentSeriesRecord = {
  key: DocumentSeriesKey;
  prefix: string;
  padding: number;
  nextNumber: number;
  /** Restart nextNumber at 1 on the first issue in a new calendar year (Europe/Sofia). Default off. */
  resetYearly: boolean;
  /** What the next document will be numbered. */
  preview: string;
};

// ─── Expiry thresholds ──────────────────────────────────────────────────────

/** Days before expiry for the four warning levels: watch, plan, sell now, pull from the shelf. */
export const DEFAULT_EXPIRY_WINDOWS = [30, 14, 7, 3] as const;
export const EXPIRY_LEVELS = ['watch', 'warning', 'urgent', 'critical'] as const;
export type ExpiryLevel = (typeof EXPIRY_LEVELS)[number];
export const MAX_EXPIRY_WINDOW_DAYS = 365;

/** Four whole numbers of days, largest first, each smaller than the one before. */
export function expiryWindowsProblem(windows: readonly number[]): string | null {
  if (windows.length !== 4) return 'Set exactly four thresholds';
  if (windows.some((days) => !Number.isInteger(days) || days < 0 || days > MAX_EXPIRY_WINDOW_DAYS)) {
    return `Each threshold is a whole number of days from 0 to ${MAX_EXPIRY_WINDOW_DAYS}`;
  }
  if (windows.some((days, index) => index > 0 && days >= windows[index - 1])) {
    return 'Each threshold must be fewer days than the one before';
  }
  return null;
}

export function expiryLevel(daysLeft: number, windows: readonly number[] = DEFAULT_EXPIRY_WINDOWS): ExpiryLevel | 'expired' | 'safe' {
  if (daysLeft < 0) return 'expired';
  const [watch, warning, urgent, critical] = windows;
  if (daysLeft <= critical) return 'critical';
  if (daysLeft <= urgent) return 'urgent';
  if (daysLeft <= warning) return 'warning';
  if (daysLeft <= watch) return 'watch';
  return 'safe';
}

/**
 * Non-cumulative bucket counts for the expiry board chips (watch → pull).
 * Expired batches are excluded; each batch falls in exactly one threshold band.
 */
export function expiryBucketCounts(daysLeftList: readonly number[], windows: readonly number[] = DEFAULT_EXPIRY_WINDOWS) {
  const [watch, warning, urgent, critical] = windows;
  const live = daysLeftList.filter((days) => days >= 0);
  return [
    { days: watch, count: live.filter((days) => days > warning && days <= watch).length },
    { days: warning, count: live.filter((days) => days > urgent && days <= warning).length },
    { days: urgent, count: live.filter((days) => days > critical && days <= urgent).length },
    { days: critical, count: live.filter((days) => days <= critical).length },
  ];
}

// ─── Print template ─────────────────────────────────────────────────────────

export type PrintTemplate = {
  /** Company name, ЕИК, VAT number and address above the document. */
  showCompanyDetails: boolean;
  showPrices: boolean;
  showBatches: boolean;
  /** Labels of the signature lines at the bottom, e.g. "Съставил", "Приел". */
  signatures: string[];
  footer: string;
};

export const DEFAULT_PRINT_TEMPLATE: PrintTemplate = {
  showCompanyDetails: true,
  showPrices: true,
  showBatches: true,
  signatures: ['Съставил', 'Приел'],
  footer: '',
};

export const MAX_PRINT_SIGNATURES = 4;
export const MAX_PRINT_FOOTER_LENGTH = 500;

export function printTemplateOf(value: unknown): PrintTemplate {
  const raw = value && typeof value === 'object' ? (value as Partial<PrintTemplate>) : {};
  return {
    showCompanyDetails: typeof raw.showCompanyDetails === 'boolean' ? raw.showCompanyDetails : DEFAULT_PRINT_TEMPLATE.showCompanyDetails,
    showPrices: typeof raw.showPrices === 'boolean' ? raw.showPrices : DEFAULT_PRINT_TEMPLATE.showPrices,
    showBatches: typeof raw.showBatches === 'boolean' ? raw.showBatches : DEFAULT_PRINT_TEMPLATE.showBatches,
    signatures: Array.isArray(raw.signatures)
      ? raw.signatures.filter((label): label is string => typeof label === 'string').slice(0, MAX_PRINT_SIGNATURES)
      : DEFAULT_PRINT_TEMPLATE.signatures,
    footer: typeof raw.footer === 'string' ? raw.footer : DEFAULT_PRINT_TEMPLATE.footer,
  };
}

// ─── Till prices ────────────────────────────────────────────────────────────

/** Roles that may charge a price other than the catalog price at the till. The owner always can. */
export const DEFAULT_PRICE_OVERRIDE_ROLES: readonly UserRole[] = ['OWNER', 'ACCOUNTANT', 'SITE_MANAGER'];

export function canOverridePrice(role: UserRole | null | undefined, allowed: readonly UserRole[]) {
  return role === 'OWNER' || Boolean(role && allowed.includes(role));
}

/** Net selling price (VAT taken out of the shelf price) below the unit cost. */
export function isBelowCost(grossPrice: number, vatRate: number, unitCost: number | null) {
  if (unitCost === null || !(unitCost > 0)) return false;
  return grossPrice / (1 + vatRate / 100) < unitCost - 0.00005;
}

// ─── Company ────────────────────────────────────────────────────────────────

export type CompanyProfile = {
  name: string;
  eik: string | null;
  vatNumber: string | null;
  address: string | null;
  city: string | null;
  mol: string | null;
  phone: string | null;
  email: string | null;
};

export type CompanySettingsRecord = {
  profile: CompanyProfile;
  expiryWindows: number[];
  printTemplate: PrintTemplate;
  priceOverrideRoles: UserRole[];
  series: DocumentSeriesRecord[];
};

// ─── Activity log ───────────────────────────────────────────────────────────

export type ActivityEntry = {
  id: string;
  at: string;
  user: { id: string | null; name: string } | null;
  entityType: string;
  entityId: string;
  /** Document number, product name… as it was when the change was made. */
  entityLabel: string | null;
  action: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
};

export type ActivityPage = {
  entries: ActivityEntry[];
  nextCursor: string | null;
  users: { id: string; name: string }[];
  entityTypes: string[];
  actions: string[];
};
