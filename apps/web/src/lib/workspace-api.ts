import type {
  ActivityPage,
  Annex38View,
  EShopSettings,
  CompanyProfile,
  CompanySettingsRecord,
  DocumentSeriesKey,
  PrintTemplate,
  CaptureExtractionStatus,
  DocumentPaymentMethod,
  DocumentStatus,
  DocumentType,
  ExportDateFormat,
  ExportDecimalSeparator,
  ExportDelimiter,
  ExportEncoding,
  ExportProfileColumn,
  PaperDocumentType,
  PartnerKind,
  PaymentMethod,
  ProductStatus,
  ReportKind,
  ReportResult,
  SiteType,
  StockDirection,
  UnitOfMeasure,
  ContentUnit,
  UserRole,
  VatCredit,
  VatEntryInput,
  VatEntryRecord,
  VatPeriodView,
  VatReturnInputs,
  VatSettingsInput,
  VatSettingsRecord,
  ComplianceFilingRecord,
  TotalsCheck,
  WriteOffReason,
} from '@skladnik/shared';
import i18n from '../i18n';
import { refreshSession } from './auth-api';

export type SiteRecord = {
  id: string;
  name: string;
  type: SiteType;
  address: string | null;
  isActive: boolean;
  deactivatedAt: string | null;
  manager: { id: string; name: string; email: string; isActive: boolean } | null;
  /** Registered as an e-shop (Annex 38). */
  eShop: boolean;
  createdAt: string;
  updatedAt: string;
};

export type UserRecord = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  allSites: boolean;
  sites: { id: string; name: string; isActive: boolean }[];
};

export type InviteStatus = 'PENDING' | 'ACCEPTED' | 'REVOKED' | 'EXPIRED';

export type InviteRecord = {
  id: string;
  email: string;
  role: UserRole;
  status: InviteStatus;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  invitedBy: { id: string; name: string };
  sites: { id: string; name: string; isActive: boolean }[];
};

export type InvitePreview = {
  email: string;
  role: UserRole;
  roleLabel: string;
  companyName: string;
  expiresAt: string;
};

export type ProductGroupNode = {
  id: string;
  name: string;
  parentId: string | null;
  productCount: number;
  createdAt: string;
  updatedAt: string;
  children: ProductGroupNode[];
};

export type PartnerRecord = {
  id: string;
  name: string;
  kind: PartnerKind;
  eik: string | null;
  vatNumber: string | null;
  address: string | null;
  mol: string | null;
  phone: string | null;
  email: string | null;
  bankAccount: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ProductRecord = {
  id: string;
  name: string;
  code: string;
  unit: UnitOfMeasure;
  packSize: number;
  netContent: number | null;
  netContentUnit: ContentUnit | null;
  vatRate: number;
  /** Omitted for Staff (CASHIER F-04). */
  purchasePrice?: number;
  sellingPrice: number;
  minStock: number;
  maxStock: number | null;
  batchTracking: boolean;
  status: ProductStatus;
  group: { id: string; name: string } | null;
  barcodes: { id: string; barcode: string }[];
  supplierCodes: {
    id: string;
    supplierCode: string;
    partner: { id: string; name: string; kind: PartnerKind };
  }[];
  createdAt: string;
  updatedAt: string;
};

export type UnitAliasRecord = {
  id: string;
  raw: string;
  unit: UnitOfMeasure;
  createdAt: string;
  updatedAt: string;
};

export type ProductWriteInput = {
  name: string;
  code: string;
  groupId?: string | null;
  unit: UnitOfMeasure;
  packSize?: number;
  netContent?: number | null;
  netContentUnit?: ContentUnit | null;
  vatRate: number;
  purchasePrice: number;
  sellingPrice: number;
  minStock?: number;
  /** When set with minStock, updates ProductSiteMin for that site (site managers). */
  siteId?: string;
  maxStock?: number | null;
  batchTracking?: boolean;
  status?: ProductStatus;
  barcodes?: string[];
};

export const workspaceKeys = {
  sites: ['workspace', 'sites'] as const,
  transferTargets: ['workspace', 'sites', 'transfer-targets'] as const,
  users: ['workspace', 'users'] as const,
  invites: ['workspace', 'invites'] as const,
  invite: (token: string) => ['workspace', 'invite', token] as const,
  productGroups: ['workspace', 'product-groups'] as const,
  partners: ['workspace', 'partners'] as const,
  partnerLookup: (filters?: { kind?: string; q?: string }) =>
    ['workspace', 'partners', 'lookup', filters ?? {}] as const,
  products: (filters?: { groupId?: string; status?: string; q?: string }) =>
    ['workspace', 'products', filters ?? {}] as const,
  unitAliases: ['workspace', 'unit-aliases'] as const,
  documents: (filters?: { status?: string; siteId?: string; type?: string }) =>
    ['workspace', 'documents', filters ?? {}] as const,
  document: (id: string) => ['workspace', 'document', id] as const,
  stock: (siteId: string) => ['workspace', 'stock', siteId] as const,
  movements: (siteId: string, productId: string, batchId?: string) =>
    ['workspace', 'stock', siteId, 'movements', productId, batchId ?? null] as const,
  reorder: (siteId: string) => ['workspace', 'stock', siteId, 'reorder'] as const,
  sales: (siteId: string, date: string) => ['workspace', 'sales', siteId, 'list', date] as const,
  sale: (id: string) => ['workspace', 'sale', id] as const,
  salesReport: (siteId: string, from: string, to: string) => ['workspace', 'sales', siteId, 'report', from, to] as const,
  margins: (siteId: string, from: string, to: string, by: string) => ['workspace', 'sales', siteId, 'margins', from, to, by] as const,
  recipes: (siteId: string) => ['workspace', 'recipes', siteId, 'list'] as const,
  recipe: (siteId: string, productId: string) => ['workspace', 'recipes', siteId, 'card', productId] as const,
  menu: (siteId: string) => ['workspace', 'recipes', siteId, 'menu'] as const,
  report: (kind: string, params: Record<string, unknown>) => ['workspace', 'reports', kind, params] as const,
  archivePreview: (params: Record<string, unknown>) => ['workspace', 'reports', 'archive', params] as const,
  exportProfiles: ['workspace', 'export-profiles'] as const,
  vatSettings: ['workspace', 'vat', 'settings'] as const,
  company: ['workspace', 'company'] as const,
  activity: (filters: ActivityFilters) => ['workspace', 'activity', filters] as const,
  vatPeriod: (period: string) => ['workspace', 'vat', 'period', period] as const,
};

/** The document that already has this partner + type + number (409 DUPLICATE_DOCUMENT). */
export type DuplicateDocumentRef = {
  id: string;
  number: string;
  type: DocumentType;
  status: DocumentStatus;
  issuedOn: string;
  partnerName: string | null;
};

/** Keeps the API's machine-readable `code` (e.g. EXPIRED_CONFIRM) and `warnings` next to the message. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly params: Record<string, string | number | boolean | null>;
  readonly warnings: string[];
  readonly existingDocument: DuplicateDocumentRef | null;
  readonly similarProducts: { id: string; name: string; code: string }[];

  constructor(
    message: string,
    status: number,
    code: string | null,
    warnings: string[],
    existingDocument: DuplicateDocumentRef | null = null,
    params: Record<string, string | number | boolean | null> = {},
    similarProducts: { id: string; name: string; code: string }[] = [],
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.params = params;
    this.warnings = warnings;
    this.existingDocument = existingDocument;
    this.similarProducts = similarProducts;
  }
}

function errorMessage(payload: unknown, fallback: string) {
  if (payload && typeof payload === 'object' && 'message' in payload) {
    const message = (payload as { message: unknown }).message;
    if (typeof message === 'string') return message;
    if (Array.isArray(message)) return message.filter((item) => typeof item === 'string').join('. ');
  }
  return fallback;
}

function errorParams(payload: unknown): Record<string, string | number | boolean | null> {
  if (!payload || typeof payload !== 'object' || !('params' in payload)) return {};
  const raw = (payload as { params: unknown }).params;
  if (!raw || typeof raw !== 'object') return {};
  const result: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value === null) {
      result[key] = value;
    }
  }
  return result;
}

/** Prefer a localised string when the API returned a machine code the client knows. */
function localisedErrorMessage(payload: unknown, fallback: string) {
  const code =
    payload && typeof payload === 'object' && typeof (payload as { code?: unknown }).code === 'string'
      ? (payload as { code: string }).code
      : null;
  if (code) {
    const key = `errors.${code}`;
    if (i18n.exists(key)) return String(i18n.t(key, errorParams(payload)));
  }
  return errorMessage(payload, fallback);
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  return (await requestWithResponse<T>(path, init)).payload;
}

/**
 * `fresh` asks the service worker to go to the network even on routes it answers from its offline
 * copy first (sites, products); used when refetching data that is already on screen.
 */
const freshInit = (fresh?: boolean): RequestInit | undefined => (fresh ? { cache: 'no-cache' } : undefined);

/** When the server produced the response; for an offline copy this is when it was saved. */
const servedAt = (response: Response) => {
  const date = response.headers.get('date');
  return date && !Number.isNaN(Date.parse(date)) ? new Date(date).toISOString() : null;
};

async function requestWithResponse<T>(
  path: string,
  init?: RequestInit & { timeoutMs?: number },
): Promise<{ payload: T; response: Response }> {
  const { headers: initHeaders, timeoutMs = 30_000, signal: outerSignal, ...rest } = init ?? {};
  const isFormData = typeof FormData !== 'undefined' && rest.body instanceof FormData;
  const headers = new Headers(initHeaders);
  if (!isFormData && rest.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const controller = new AbortController();
  let timedOut = false;
  const onOuterAbort = () => controller.abort();
  if (outerSignal) {
    if (outerSignal.aborted) controller.abort();
    else outerSignal.addEventListener('abort', onOuterAbort, { once: true });
  }
  const timer = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  const send = () => fetch(path, { credentials: 'include', ...rest, headers, signal: controller.signal });
  try {
    let response = await send();
    if (response.status === 401 && (await refreshSession())) response = await send();
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const body = payload as {
        code?: unknown;
        warnings?: unknown;
        existingDocument?: unknown;
        similarProducts?: unknown;
      };
      const existing = body.existingDocument;
      const similarRaw = Array.isArray(body.similarProducts) ? body.similarProducts : [];
      const similarProducts = similarRaw.filter(
        (row): row is { id: string; name: string; code: string } =>
          Boolean(
            row &&
              typeof row === 'object' &&
              typeof (row as { id?: unknown }).id === 'string' &&
              typeof (row as { name?: unknown }).name === 'string' &&
              typeof (row as { code?: unknown }).code === 'string',
          ),
      );
      throw new ApiError(
        localisedErrorMessage(payload, 'Something went wrong. Please try again.'),
        response.status,
        typeof body.code === 'string' ? body.code : null,
        Array.isArray(body.warnings) ? body.warnings.filter((item): item is string => typeof item === 'string') : [],
        existing && typeof existing === 'object' && typeof (existing as { id?: unknown }).id === 'string'
          ? (existing as DuplicateDocumentRef)
          : null,
        errorParams(payload),
        similarProducts,
      );
    }
    return { payload: payload as T, response };
  } catch (error) {
    if (controller.signal.aborted) {
      if (timedOut) {
        throw new ApiError(
          localisedErrorMessage({ code: 'REQUEST_TIMEOUT' }, 'The request took too long. Please try again.'),
          408,
          'REQUEST_TIMEOUT',
          [],
        );
      }
      // Route change / query cancel — let React Query treat it as cancellation.
      throw error;
    }
    throw error;
  } finally {
    window.clearTimeout(timer);
    outerSignal?.removeEventListener('abort', onOuterAbort);
  }
}

export function fetchSites(options?: { fresh?: boolean }) {
  return requestJson<{ sites: SiteRecord[] }>('/sites', freshInit(options?.fresh));
}

export function fetchTransferTargets() {
  return requestJson<{ sites: { id: string; name: string; type: SiteType }[] }>('/sites/transfer-targets');
}

export function createSite(input: { name: string; type: SiteType; address?: string; managerUserId?: string }) {
  return requestJson<{ site: SiteRecord }>('/sites', { method: 'POST', body: JSON.stringify(input) });
}

export function updateSite(
  id: string,
  input: { name?: string; type?: SiteType; address?: string; managerUserId?: string | null; isActive?: boolean },
) {
  return requestJson<{ site: SiteRecord }>(`/sites/${id}`, { method: 'PATCH', body: JSON.stringify(input) });
}

export function deactivateSite(id: string) {
  return requestJson<{ site: SiteRecord }>(`/sites/${id}`, { method: 'DELETE' });
}

export function fetchUsers() {
  return requestJson<{ users: UserRecord[] }>('/users');
}

export function updateUser(id: string, input: { role?: UserRole; siteIds?: string[]; isActive?: boolean }) {
  return requestJson<{ user: UserRecord }>(`/users/${id}`, { method: 'PATCH', body: JSON.stringify(input) });
}

export function deactivateUser(id: string) {
  return requestJson<{ user: UserRecord }>(`/users/${id}`, { method: 'DELETE' });
}

export function fetchInvites() {
  return requestJson<{ invites: InviteRecord[] }>('/invites');
}

export function fetchInvitePreview(token: string) {
  return requestJson<InvitePreview>(`/invites/${token}`);
}

export function createInvite(input: { email: string; role: UserRole; siteIds?: string[] }) {
  return requestJson<{ invite: InviteRecord; inviteUrl: string; delivered: boolean }>('/invites', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function resendInvite(id: string) {
  return requestJson<{ invite: InviteRecord; inviteUrl: string; delivered: boolean }>(`/invites/${id}/resend`, {
    method: 'POST',
  });
}

export function revokeInvite(id: string) {
  return requestJson<{ invite: InviteRecord }>(`/invites/${id}/revoke`, { method: 'POST' });
}

export function flattenProductGroups(
  nodes: ProductGroupNode[],
  depth = 0,
): { id: string; name: string; depth: number; label: string }[] {
  return nodes.flatMap((node) => [
    { id: node.id, name: node.name, depth, label: `${'— '.repeat(depth)}${node.name}` },
    ...flattenProductGroups(node.children, depth + 1),
  ]);
}

export function fetchProductGroups() {
  return requestJson<{ groups: ProductGroupNode[] }>('/product-groups');
}

export function createProductGroup(input: { name: string; parentId?: string }) {
  return requestJson<{ group: Omit<ProductGroupNode, 'children'> }>('/product-groups', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateProductGroup(id: string, input: { name?: string; parentId?: string | null }) {
  return requestJson<{ group: Omit<ProductGroupNode, 'children'> }>(`/product-groups/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function deleteProductGroup(id: string) {
  return requestJson<{ ok: true }>(`/product-groups/${id}`, { method: 'DELETE' });
}

export function fetchPartners(kind?: PartnerKind) {
  const query = kind ? `?kind=${kind}` : '';
  return requestJson<{ partners: PartnerRecord[] }>(`/partners${query}`);
}

/** Id + name (+ kind) for document partner pickers; Staff-safe. */
export type PartnerLookupItem = { id: string; name: string; kind: PartnerKind };

export function fetchPartnerLookup(kind?: PartnerKind, q?: string) {
  const params = new URLSearchParams();
  if (kind) params.set('kind', kind);
  if (q?.trim()) params.set('q', q.trim());
  const query = params.toString();
  return requestJson<{ partners: PartnerLookupItem[] }>(`/partners/lookup${query ? `?${query}` : ''}`);
}

export function createPartner(input: {
  name: string;
  kind: PartnerKind;
  eik?: string;
  vatNumber?: string;
  address?: string;
  mol?: string;
  phone?: string;
  email?: string;
  bankAccount?: string;
}) {
  return requestJson<{ partner: PartnerRecord }>('/partners', { method: 'POST', body: JSON.stringify(input) });
}

export function updatePartner(
  id: string,
  input: {
    name?: string;
    kind?: PartnerKind;
    eik?: string | null;
    vatNumber?: string | null;
    address?: string | null;
    mol?: string | null;
    phone?: string | null;
    email?: string | null;
    bankAccount?: string | null;
  },
) {
  return requestJson<{ partner: PartnerRecord }>(`/partners/${id}`, { method: 'PATCH', body: JSON.stringify(input) });
}

export function deletePartner(id: string) {
  return requestJson<{ ok: true }>(`/partners/${id}`, { method: 'DELETE' });
}

export function fetchProducts(filters?: { groupId?: string; status?: ProductStatus; q?: string }, options?: { fresh?: boolean }) {
  const params = new URLSearchParams();
  if (filters?.groupId) params.set('groupId', filters.groupId);
  if (filters?.status) params.set('status', filters.status);
  if (filters?.q) params.set('q', filters.q);
  const query = params.toString();
  return requestJson<{ products: ProductRecord[] }>(`/products${query ? `?${query}` : ''}`, freshInit(options?.fresh));
}

export function createProduct(input: ProductWriteInput) {
  return requestJson<{ product: ProductRecord }>('/products', { method: 'POST', body: JSON.stringify(input) });
}

export function updateProduct(id: string, input: Partial<ProductWriteInput>) {
  return requestJson<{ product: ProductRecord }>(`/products/${id}`, { method: 'PATCH', body: JSON.stringify(input) });
}

export function archiveProduct(id: string) {
  return requestJson<{ product: ProductRecord }>(`/products/${id}`, { method: 'DELETE' });
}

export function addSupplierCode(productId: string, input: { partnerId: string; supplierCode: string }) {
  return requestJson<{ mapping: ProductRecord['supplierCodes'][number] }>(`/products/${productId}/supplier-codes`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function removeSupplierCode(productId: string, mappingId: string) {
  return requestJson<{ ok: true }>(`/products/${productId}/supplier-codes/${mappingId}`, { method: 'DELETE' });
}

export function fetchUnitAliases() {
  return requestJson<{ aliases: UnitAliasRecord[] }>('/unit-aliases');
}

export function createUnitAlias(input: { raw: string; unit: UnitOfMeasure }) {
  return requestJson<{ alias: UnitAliasRecord }>('/unit-aliases', { method: 'POST', body: JSON.stringify(input) });
}

export function updateUnitAlias(id: string, input: { raw?: string; unit?: UnitOfMeasure }) {
  return requestJson<{ alias: UnitAliasRecord }>(`/unit-aliases/${id}`, { method: 'PATCH', body: JSON.stringify(input) });
}

export function deleteUnitAlias(id: string) {
  return requestJson<{ ok: true }>(`/unit-aliases/${id}`, { method: 'DELETE' });
}

export type DocumentListItem = {
  id: string;
  type: DocumentType;
  status: DocumentStatus;
  direction: StockDirection;
  documentNumber: string;
  issuedOn: string;
  writeOffReason: WriteOffReason | null;
  partner: { id: string; name: string; kind: PartnerKind; eik: string | null; vatNumber: string | null } | null;
  site: { id: string; name: string; type: SiteType; isActive: boolean };
  /** Receiving site of a transfer. */
  targetSite: { id: string; name: string; type: SiteType; isActive: boolean } | null;
  lineCount: number;
  captureCount: number;
  createdAt: string;
  postedAt: string | null;
  /** Who opened the draft (Staff overview: my pending docs). */
  createdBy?: { id: string; name: string } | null;
  /** Set on a reversal: the posted document it undoes. */
  reversalOf: { id: string; documentNumber: string; issuedOn: string } | null;
  /** Set on a reversed document. */
  reversedBy: { id: string; documentNumber: string; issuedOn: string; reason: string | null; by: string | null } | null;
  /** Posted, not a reversal and not reversed yet. */
  reversible: boolean;
};

export type ProductSuggestion = {
  id: string;
  name: string;
  code: string;
  unit: UnitOfMeasure;
  vatRate: number;
  batchTracking: boolean;
  score: number;
  /** Present when the hit is still waiting for manager approval. */
  status?: 'ACTIVE' | 'PENDING_REVIEW' | 'ARCHIVED';
};

export type CreateProductFromLineInput = {
  name: string;
  code?: string;
  unit: UnitOfMeasure;
  vatRate: number;
  batchTracking?: boolean;
};

export type DocumentLineRecord = {
  id: string;
  position: number;
  sourceCaptureId: string | null;
  printed: {
    description: string | null;
    supplierCode: string | null;
    barcode: string | null;
    unit: string | null;
    /** The printed name without batch, expiry or codes. */
    name: string | null;
  };
  productId: string | null;
  product: {
    id: string;
    name: string;
    code: string;
    unit: UnitOfMeasure;
    vatRate: number;
    batchTracking: boolean;
    status: ProductStatus;
  } | null;
  /** Likely catalog products for a line with no product (or one a scan made up), best first. */
  suggestions: ProductSuggestion[];
  quantity: number;
  /** Omitted for Staff (CASHIER F-04). */
  unitPrice?: number;
  freeOfCharge?: boolean;
  missingPrice?: boolean;
  discountPercent: number;
  /** Always quantity × price × (1 − discount), worked out by the server. */
  finalUnitPrice?: number | null;
  lineTotal?: number | null;
  /** What OCR read as the line total, only for comparison. */
  printedLineTotal: number | null;
  /** The batch expires before the document date on a document that needs confirmation for it. */
  expired: boolean;
  vatRate: number;
  unit: UnitOfMeasure | null;
  batchNumber: string | null;
  expiryDate: string | null;
  /** CAF-01 / CAF-03 flags from the server. Absent on older responses. */
  quantityCheck?: boolean;
  unitCheck?: boolean;
  batchNotTracked?: boolean;
  batch: { id: string; batchNumber: string; expiryDate: string | null } | null;
  verified: boolean;
  /** Only on stocktake documents. Expected is live until posting, then frozen. */
  stocktake?: {
    countedQuantity: number | null;
    expectedQuantity: number | null;
    varianceQuantity: number | null;
    varianceValue: number | null;
    unitCost: number;
  };
};

export type StocktakeSummary = {
  lines: number;
  counted: number;
  linesWithVariance: number;
  shortageValue: number;
  surplusValue: number;
  netValue: number;
};

export type DocumentCaptureRecord = {
  id: string;
  pageNumber: number;
  imageKey: string;
  createdAt: string;
  extractionStatus: CaptureExtractionStatus;
  extractionFailed: boolean;
  extractionError: string | null;
  confidence: 'high' | 'medium' | 'low' | null;
};

export type DocumentDetail = Omit<DocumentListItem, 'lineCount' | 'captureCount'> & {
  deliveryAddress: string | null;
  notes: string | null;
  /** Who entered the document ("Съставил"). */
  createdBy: { id: string; name: string } | null;
  paymentMethod: DocumentPaymentMethod | null;
  /** Printed vs calculated totals; null on internal documents. */
  totals: TotalsCheck | null;
  extraction: {
    confidence: 'high' | 'medium' | 'low' | null;
    reading: boolean;
  };
  lines: DocumentLineRecord[];
  captures: DocumentCaptureRecord[];
  stocktake: StocktakeSummary | null;
};

export type DocumentDetailResponse = {
  document: DocumentDetail;
  /** `confirmExpired` / `confirmDate` mean posting needs that flag because of `expired` / `dateWarning`. */
  posting: {
    ok: boolean;
    /** Staff may submit when only reviewWarnings remain (pending product, bad ЕИК, totals, …). */
    canSubmit: boolean;
    errors: string[];
    /** Post-blocking issues shown to the reviewer after Staff submit (SKL-01/03/08). */
    reviewWarnings: string[];
    warnings: string[];
    expired: string[];
    dateWarning: string | null;
    confirmExpired: boolean;
    confirmDate: boolean;
    duplicateOf: DuplicateDocumentRef | null;
  };
};

export type PostDocumentOptions = { confirmExpired?: boolean; confirmDate?: boolean };

export type PrintedTotalsInput = {
  printedTaxableBase?: number | null;
  printedVatAmount?: number | null;
  printedTotal?: number | null;
  paymentMethod?: DocumentPaymentMethod | null;
};

export type DocumentWriteInput = {
  type: DocumentType;
  siteId: string;
  targetSiteId?: string;
  partnerId?: string;
  /** Left out for documents the company numbers itself; the server takes the next number of the series. */
  documentNumber?: string;
  issuedOn: string;
  direction?: StockDirection;
  deliveryAddress?: string;
  notes?: string;
  writeOffReason?: WriteOffReason;
};

export type DocumentUpdateInput = Partial<Omit<DocumentWriteInput, 'partnerId' | 'writeOffReason' | 'targetSiteId'>> &
  PrintedTotalsInput & {
    partnerId?: string | null;
    targetSiteId?: string | null;
    writeOffReason?: WriteOffReason | null;
  };

export type DocumentLineWriteInput = {
  productId: string;
  /** Required on every document type except stocktakes. */
  quantity?: number;
  unitPrice: number;
  freeOfCharge?: boolean;
  discountPercent?: number;
  vatRate?: number;
  batchNumber?: string;
  expiryDate?: string;
  /** Stocktake only; null means not counted yet. */
  countedQuantity?: number | null;
  /** CAF-01: confirm the stored quantity or the product unit. */
  confirmQuantity?: boolean;
  confirmUnit?: boolean;
};

/** Stocktakes open on their count sheet, sales on their receipt; every other document in the document editor. */
export function documentPath(document: { id: string; type: DocumentType }) {
  if (document.type === 'STOCKTAKE') return `/app/stocktake/${document.id}`;
  if (document.type === 'SALE') return `/app/sales/${document.id}`;
  return `/app/invoices/${document.id}`;
}

export function fetchDocuments(filters?: { status?: DocumentStatus; siteId?: string; type?: DocumentType }) {
  const params = new URLSearchParams();
  if (filters?.status) params.set('status', filters.status);
  if (filters?.siteId) params.set('siteId', filters.siteId);
  if (filters?.type) params.set('type', filters.type);
  const query = params.toString();
  return requestJson<{ documents: DocumentListItem[] }>(`/documents${query ? `?${query}` : ''}`);
}

export function fetchDocument(id: string, options?: { fresh?: boolean }) {
  return requestJson<DocumentDetailResponse>(`/documents/${id}`, freshInit(options?.fresh));
}

export function createDocument(input: DocumentWriteInput) {
  return requestJson<DocumentDetailResponse>('/documents', { method: 'POST', body: JSON.stringify(input) });
}

export function updateDocument(id: string, input: DocumentUpdateInput) {
  return requestJson<DocumentDetailResponse>(`/documents/${id}`, { method: 'PATCH', body: JSON.stringify(input) });
}

export function addDocumentLine(id: string, input: DocumentLineWriteInput) {
  return requestJson<DocumentDetailResponse>(`/documents/${id}/lines`, { method: 'POST', body: JSON.stringify(input) });
}

export function enableProductBatchTracking(id: string) {
  return requestJson<{ product: ProductRecord }>(`/products/${id}/enable-batch-tracking`, { method: 'POST' });
}

export function mergePendingProduct(id: string, intoProductId: string) {
  return requestJson<{ productId: string }>(`/products/${id}/merge`, {
    method: 'POST',
    body: JSON.stringify({ productId: intoProductId }),
  });
}

export function createProductFromLine(id: string, lineId: string, input: CreateProductFromLineInput) {
  return requestJson<DocumentDetailResponse>(`/documents/${id}/lines/${lineId}/create-product`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateDocumentLine(id: string, lineId: string, input: Partial<DocumentLineWriteInput>) {
  return requestJson<DocumentDetailResponse>(`/documents/${id}/lines/${lineId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function deleteDocumentLine(id: string, lineId: string) {
  return requestJson<DocumentDetailResponse>(`/documents/${id}/lines/${lineId}`, { method: 'DELETE' });
}

export function submitDocument(id: string) {
  return requestJson<DocumentDetailResponse>(`/documents/${id}/submit-for-review`, { method: 'POST' });
}

export function postDocument(id: string, options: PostDocumentOptions = {}) {
  return requestJson<DocumentDetailResponse>(`/documents/${id}/post`, {
    method: 'POST',
    body: JSON.stringify(options),
  });
}

export function fillStocktake(id: string) {
  return requestJson<DocumentDetailResponse>(`/documents/${id}/stocktake/fill`, { method: 'POST' });
}

export function setStocktakeCounts(id: string, counts: { lineId: string; countedQuantity: number | null }[]) {
  return requestJson<DocumentDetailResponse>(`/documents/${id}/stocktake/counts`, {
    method: 'PATCH',
    body: JSON.stringify({ counts }),
  });
}

export function cancelDocument(id: string) {
  return requestJson<DocumentDetailResponse>(`/documents/${id}/cancel`, { method: 'POST' });
}

/** Preview next automatic batch number for the line form "Авто" button (SKL-15). */
export function suggestDocumentAutoBatch(documentId: string, input: { productId: string; expiryDate: string }) {
  return requestJson<{ batchNumber: string; expiryDate: string; isAutomatic: boolean }>(
    `/documents/${documentId}/suggest-auto-batch`,
    { method: 'POST', body: JSON.stringify(input) },
  );
}

export type ReverseDocumentInput = { reason: string; confirmFiledPeriod?: boolean };

/** Returns the new reversal document. */
export function reverseDocument(id: string, input: ReverseDocumentInput) {
  return requestJson<DocumentDetailResponse>(`/documents/${id}/reverse`, { method: 'POST', body: JSON.stringify(input) });
}

/** Creates the draft and stores the photo in one request; repeating it with the same clientRequestId returns the same document. */
export function scanDocument(input: {
  clientRequestId: string;
  siteId: string;
  type: PaperDocumentType;
  issuedOn: string;
  capturedAt: string;
  file: File;
}) {
  const body = new FormData();
  body.append('clientRequestId', input.clientRequestId);
  body.append('siteId', input.siteId);
  body.append('type', input.type);
  body.append('issuedOn', input.issuedOn);
  body.append('capturedAt', input.capturedAt);
  body.append('file', input.file);
  return requestJson<DocumentDetailResponse>('/documents/scan', { method: 'POST', body });
}

export function uploadDocumentCapture(id: string, file: File) {
  const body = new FormData();
  body.append('file', file);
  return requestJson<DocumentDetailResponse>(`/documents/${id}/captures`, { method: 'POST', body });
}

export function fetchCaptureUrl(id: string, captureId: string) {
  return requestJson<{ id: string; pageNumber: number; signedUrl: string }>(`/documents/${id}/captures/${captureId}/url`);
}

export function captureFileUrl(documentId: string, captureId: string) {
  return `/documents/${documentId}/captures/${captureId}/file`;
}

export type StockLevelStatus = 'OUT' | 'LOW' | 'OK';

export type StockLevel = {
  productId: string;
  name: string;
  code: string;
  unit: UnitOfMeasure;
  productStatus: ProductStatus;
  group: { id: string; name: string } | null;
  barcodes: string[];
  minStock: number;
  maxStock: number | null;
  batchTracking: boolean;
  /** Omitted for Staff (CASHIER F-04). */
  purchasePrice?: number;
  /** Shelf price per unit, VAT included. */
  sellingPrice: number;
  vatRate: number;
  /** Weighted-average cost per unit at this site. Omitted for Staff. */
  avgCost?: number | null;
  /** On-hand value at cost (batches at their own cost). Omitted for Staff. */
  value?: number;
  onHand: number;
  status: StockLevelStatus;
  /** Quantity to order to get back to max (or 2× min); null when not below min. */
  suggestedOrder: number | null;
  lastMovementAt: string | null;
  /** Batches with stock left at this site, earliest expiry first. */
  batches: StockBatch[];
};

export type StockBatch = {
  batchId: string;
  batchNumber: string;
  expiryDate: string | null;
  onHand: number;
  /** System-generated batch number (SKL-15 Авто). */
  isAutomatic?: boolean;
  /** Omitted for Staff (CASHIER F-04). */
  unitCost?: number;
  value?: number;
};

export async function fetchStock(siteId: string) {
  const { payload, response } = await requestWithResponse<{ siteId: string; items: StockLevel[] }>(`/stock?siteId=${encodeURIComponent(siteId)}`);
  return { ...payload, servedAt: servedAt(response) };
}

export type StockMovementRecord = {
  id: string;
  occurredAt: string;
  direction: StockDirection;
  quantity: number;
  unitCost: number | null;
  value: number | null;
  /** Running on-hand after this movement (of the filtered batch, when filtering). */
  balance: number;
  batch: { id: string; batchNumber: string; expiryDate: string | null } | null;
  document: {
    id: string;
    type: DocumentType;
    number: string;
    writeOffReason: WriteOffReason | null;
    /** A void of a sale (stock coming back). */
    reversal: boolean;
    partner: { id: string; name: string } | null;
    counterpartSite: { id: string; name: string } | null;
  } | null;
};

export type StockMovementsResponse = {
  siteId: string;
  product: { id: string; name: string; code: string; unit: UnitOfMeasure; batchTracking: boolean; status: ProductStatus };
  onHand: number;
  batches: { batchId: string; batchNumber: string; expiryDate: string | null; onHand: number }[];
  movements: StockMovementRecord[];
  truncated: boolean;
};

export function fetchMovements(siteId: string, productId: string, batchId?: string) {
  const params = new URLSearchParams({ siteId, productId });
  if (batchId) params.set('batchId', batchId);
  return requestJson<StockMovementsResponse>(`/stock/movements?${params}`);
}

export type ReorderLine = {
  productId: string;
  name: string;
  code: string;
  unit: UnitOfMeasure;
  supplierCode: string | null;
  onHand: number;
  minStock: number;
  maxStock: number | null;
  suggestedQty: number;
  /** Omitted for Staff (CASHIER F-04). */
  unitPrice?: number;
  lineTotal?: number;
};

export type ReorderSupplier = {
  partner: {
    id: string;
    name: string;
    phone?: string | null;
    email?: string | null;
    eik?: string | null;
    vatNumber?: string | null;
  } | null;
  lines: ReorderLine[];
  /** Omitted for Staff (CASHIER F-04). */
  total?: number;
};

export function fetchReorder(siteId: string) {
  return requestJson<{ siteId: string; suppliers: ReorderSupplier[] }>(
    `/stock/reorder?siteId=${encodeURIComponent(siteId)}`,
  );
}

export type SaleItemInput = {
  productId: string;
  quantity: number;
  /** Manual batch override; omit for FEFO. */
  batchId?: string;
  /** Omit to sell at the catalog price (only managers may change it). */
  unitPrice?: number;
};

export type SaleInput = {
  siteId: string;
  paymentMethod: PaymentMethod;
  /** Card transaction reference, asked for at e-shop sites (Annex 38). */
  paymentReference?: string;
  items: SaleItemInput[];
  clientRequestId: string;
  confirmExpired?: boolean;
  confirmBelowCost?: boolean;
};

export type SaleLineRecord = {
  id: string;
  product: { id: string; name: string; code: string; unit: UnitOfMeasure } | null;
  batch: { id: string; batchNumber: string; expiryDate: string | null } | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  vatRate: number;
  /** Managers only. */
  cost?: number;
  /** Managers only: what a dish line took from stock through its recipe. */
  issued?: { productId: string; name: string; unit: UnitOfMeasure; batchNumber: string | null; quantity: number }[];
};

export type SaleRecord = {
  id: string;
  number: string;
  kind: 'SALE' | 'VOID';
  postedAt: string | null;
  businessDate: string;
  paymentMethod: PaymentMethod | null;
  paymentReference: string | null;
  site: { id: string; name: string };
  cashier: { id: string; name: string } | null;
  note: string | null;
  reversalOf: { id: string; number: string; postedAt: string | null } | null;
  voidedBy: { id: string; number: string; postedAt: string | null; reason: string | null; by: { id: string; name: string } | null } | null;
  total: number;
  vat: { rate: number; gross: number; net: number; vat: number }[];
  cost?: number;
  profit?: number;
  canVoid: boolean;
  lines: SaleLineRecord[];
};

export type SaleListItem = {
  id: string;
  number: string;
  kind: 'SALE' | 'VOID';
  postedAt: string;
  paymentMethod: PaymentMethod | null;
  total: number;
  lineCount: number;
  cashier: { id: string; name: string } | null;
  note: string | null;
  reversalOf: { id: string; number: string } | null;
  voidedBy: { id: string; number: string; postedAt: string | null } | null;
};

type CostFields = { cost?: number; profit?: number; marginPercent?: number | null; linesWithoutCost?: number };

export type SalesSummary = CostFields & {
  sales: { count: number; amount: number };
  voids: { count: number; amount: number };
  tickets: number;
  turnover: number;
  net: number;
  vat: number;
  averageTicket: number;
  payments: Record<PaymentMethod, { count: number; amount: number }>;
  hours: { hour: number; count: number; amount: number }[];
};

export type MarginRow = CostFields & {
  id: string | null;
  name: string;
  code: string | null;
  quantity: number;
  gross: number;
  net: number;
};

export type SalesReport = {
  siteId: string;
  from: string;
  to: string;
  showsCost: boolean;
  summary: SalesSummary;
  topProducts: MarginRow[];
};

export type MarginsReport = {
  siteId: string;
  from: string;
  to: string;
  by: 'product' | 'group';
  totals: Required<CostFields> & { gross: number; net: number };
  rows: MarginRow[];
};

export function createSale(input: SaleInput) {
  return requestJson<{ sale: SaleRecord }>('/sales', { method: 'POST', body: JSON.stringify(input) });
}

export function fetchSales(siteId: string, date: string) {
  return requestJson<{ siteId: string; date: string; sales: SaleListItem[] }>(
    `/sales?${new URLSearchParams({ siteId, date })}`,
  );
}

export function fetchSale(id: string) {
  return requestJson<{ sale: SaleRecord }>(`/sales/${id}`);
}

export function voidSale(id: string, reason?: string) {
  return requestJson<{ sale: SaleRecord }>(`/sales/${id}/void`, { method: 'POST', body: JSON.stringify({ reason }) });
}

export function fetchSalesReport(siteId: string, from: string, to: string) {
  return requestJson<SalesReport>(`/sales/report?${new URLSearchParams({ siteId, from, to })}`);
}

export function fetchMargins(siteId: string, from: string, to: string, by: 'product' | 'group') {
  return requestJson<MarginsReport>(`/sales/margins?${new URLSearchParams({ siteId, from, to, by })}`);
}

export type RecipeDish = {
  id: string;
  name: string;
  code: string;
  unit: UnitOfMeasure;
  status: ProductStatus;
  sellingPrice: number;
  vatRate: number;
  group: { id: string; name: string } | null;
};

export type RecipeCostingRecord = {
  lines: { gross: number; perPortion: number; costed: boolean; cost: number }[];
  costPerPortion: number;
  missingCosts: number;
  netPrice: number;
  profit: number;
  marginPercent: number | null;
  foodCostPercent: number | null;
  suggestedPrice: number;
};

export type RecipeListItem = {
  dish: RecipeDish;
  yieldPortions: number;
  markupPercent: number;
  ingredientCount: number;
  costPerPortion: number;
  missingCosts: number;
  profit: number;
  marginPercent: number | null;
  foodCostPercent: number | null;
  suggestedPrice: number;
  updatedAt: string;
};

export type RecipeIngredientRecord = {
  productId: string;
  name: string;
  code: string;
  unit: UnitOfMeasure;
  netContent: number | null;
  netContentUnit: ContentUnit | null;
  status: ProductStatus;
  /** Net quantity for the whole yield, in `quantityUnit` or the stock unit. */
  quantity: number;
  quantityUnit: ContentUnit | null;
  wastagePercent: number;
  /** Gross quantity in the product's stock unit (after wastage). */
  gross: number;
  unitCost: number;
  onHand: number;
};

export type RecipeCard = {
  dish: RecipeDish;
  usedAsIngredient: boolean;
  recipe: { yieldPortions: number; markupPercent: number; notes: string | null; updatedAt: string } | null;
  ingredients: RecipeIngredientRecord[];
  costing: RecipeCostingRecord | null;
};

export type RecipeWriteInput = {
  yieldPortions: number;
  markupPercent: number;
  notes?: string | null;
  ingredients: { productId: string; quantity: number; quantityUnit?: ContentUnit | null; wastagePercent: number }[];
};

export type MenuDish = RecipeDish & {
  barcodes: string[];
  /** Gross quantity of each ingredient one portion takes. */
  ingredients: { productId: string; perPortion: number }[];
  portionsAvailable: number;
};

export function fetchRecipes(siteId: string) {
  return requestJson<{ siteId: string; recipes: RecipeListItem[] }>(`/recipes?${new URLSearchParams({ siteId })}`);
}

export function fetchRecipe(siteId: string, productId: string) {
  return requestJson<RecipeCard>(`/recipes/${productId}?${new URLSearchParams({ siteId })}`);
}

export function saveRecipe(productId: string, input: RecipeWriteInput) {
  return requestJson<{ productId: string }>(`/recipes/${productId}`, { method: 'PUT', body: JSON.stringify(input) });
}

export function deleteRecipe(productId: string) {
  return requestJson<{ productId: string }>(`/recipes/${productId}`, { method: 'DELETE' });
}

export function fetchMenu(siteId: string) {
  return requestJson<{ siteId: string; dishes: MenuDish[] }>(`/recipes/menu?${new URLSearchParams({ siteId })}`);
}

export type ReportParams = Record<string, string | number | boolean | undefined>;

export type ExportProfileRecord = {
  id: string;
  reportKind: ReportKind;
  name: string;
  columns: ExportProfileColumn[];
  delimiter: ExportDelimiter;
  decimalSeparator: ExportDecimalSeparator;
  dateFormat: ExportDateFormat;
  encoding: ExportEncoding;
  includeHeader: boolean;
  updatedAt: string;
};

export type ExportProfileInput = Omit<ExportProfileRecord, 'id' | 'updatedAt'>;

export type ArchivePreview = {
  from: string;
  to: string;
  documents: number;
  files: number;
  /** Paper documents in the period entered by hand, with nothing to archive. */
  withoutScans: number;
  sample: string[];
};

function queryString(params: ReportParams) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === '' || value === false) continue;
    search.set(key, String(value));
  }
  return search.toString();
}

export function fetchReport(kind: ReportKind, params: ReportParams, init?: RequestInit) {
  return requestJson<ReportResult>(`/reports/${kind}?${queryString(params)}`, init);
}

export function reportExportPath(kind: ReportKind, params: ReportParams & { format: 'csv' | 'xlsx'; profileId?: string }) {
  return `/reports/${kind}/export?${queryString(params)}`;
}

export function fetchArchivePreview(params: ReportParams, init?: RequestInit) {
  return requestJson<ArchivePreview>(`/reports/archive/preview?${queryString(params)}`, init);
}

export function archivePath(params: ReportParams) {
  return `/reports/archive?${queryString(params)}`;
}

export function fetchExportProfiles(reportKind?: ReportKind) {
  return requestJson<ExportProfileRecord[]>(`/export-profiles?${queryString({ reportKind })}`);
}

export function createExportProfile(input: ExportProfileInput) {
  return requestJson<ExportProfileRecord>('/export-profiles', { method: 'POST', body: JSON.stringify(input) });
}

export function updateExportProfile(id: string, input: ExportProfileInput) {
  return requestJson<ExportProfileRecord>(`/export-profiles/${id}`, { method: 'PUT', body: JSON.stringify(input) });
}

export function deleteExportProfile(id: string) {
  return requestJson<{ ok: true }>(`/export-profiles/${id}`, { method: 'DELETE' });
}

export function fetchCompanySettings() {
  return requestJson<CompanySettingsRecord>('/company');
}

export function saveCompanyProfile(input: CompanyProfile) {
  return requestJson<CompanySettingsRecord>('/company/profile', { method: 'PUT', body: JSON.stringify(input) });
}

export function saveExpiryWindows(windows: number[]) {
  return requestJson<CompanySettingsRecord>('/company/expiry-windows', { method: 'PUT', body: JSON.stringify({ windows }) });
}

export function savePrintTemplate(input: PrintTemplate) {
  return requestJson<CompanySettingsRecord>('/company/print-template', { method: 'PUT', body: JSON.stringify(input) });
}

export function savePriceOverrideRoles(roles: UserRole[]) {
  return requestJson<CompanySettingsRecord>('/company/price-override-roles', { method: 'PUT', body: JSON.stringify({ roles }) });
}

export function saveDocumentSeries(
  key: DocumentSeriesKey,
  input: { prefix: string; padding: number; nextNumber: number; resetYearly: boolean },
) {
  return requestJson<CompanySettingsRecord>(`/company/series/${key}`, { method: 'PUT', body: JSON.stringify(input) });
}

export type ActivityFilters = {
  userId?: string;
  entityType?: string;
  entityId?: string;
  action?: string;
  q?: string;
  from?: string;
  to?: string;
};

export function fetchActivity(filters: ActivityFilters, cursor?: string | null) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);
  if (cursor) params.set('cursor', cursor);
  const query = params.toString();
  return requestJson<ActivityPage>(`/activity${query ? `?${query}` : ''}`);
}

export function fetchVatSettings() {
  return requestJson<VatSettingsRecord>('/vat/settings');
}

export function saveVatSettings(input: VatSettingsInput) {
  return requestJson<VatSettingsRecord>('/vat/settings', { method: 'PUT', body: JSON.stringify(input) });
}

export function fetchVatPeriod(period: string, init?: RequestInit) {
  return requestJson<VatPeriodView>(`/vat/periods/${period}`, init);
}

export function saveVatReturnInputs(period: string, input: VatReturnInputs) {
  return requestJson<VatPeriodView>(`/vat/periods/${period}/inputs`, { method: 'PUT', body: JSON.stringify(input) });
}

export function setVatDocumentTreatment(id: string, input: { vatCredit?: VatCredit | null; vatPeriod?: string | null }) {
  return requestJson<{ ok: true }>(`/vat/documents/${id}`, { method: 'PATCH', body: JSON.stringify(input) });
}

export function saveVatEntry(id: string | null, input: VatEntryInput) {
  return requestJson<VatEntryRecord>(id ? `/vat/entries/${id}` : '/vat/entries', { method: id ? 'PUT' : 'POST', body: JSON.stringify(input) });
}

export function deleteVatEntry(id: string) {
  return requestJson<{ ok: true }>(`/vat/entries/${id}`, { method: 'DELETE' });
}

export function generateVatFiling(period: string) {
  return requestJson<ComplianceFilingRecord>(`/vat/periods/${period}/filings`, { method: 'POST' });
}

export function markVatFilingSubmitted(id: string, input: { submissionRef: string; submittedAt?: string }) {
  return requestJson<ComplianceFilingRecord>(`/vat/filings/${id}/submitted`, { method: 'POST', body: JSON.stringify(input) });
}

export function vatFilingDownloadPath(id: string) {
  return `/vat/filings/${id}/download`;
}

export type Annex38Site = { id: string; name: string; isActive: boolean; settings: EShopSettings | null };

export function fetchAnnex38Sites() {
  return requestJson<{ sites: Annex38Site[] }>('/annex38/sites');
}

export function saveEShopSettings(siteId: string, input: EShopSettings) {
  return requestJson<{ siteId: string; settings: EShopSettings }>(`/annex38/sites/${siteId}`, { method: 'PUT', body: JSON.stringify(input) });
}

export function fetchAnnex38Period(siteId: string, period: string) {
  return requestJson<Annex38View>(`/annex38/sites/${siteId}/periods/${period}`);
}

export function generateAnnex38(siteId: string, period: string) {
  return requestJson<ComplianceFilingRecord>(`/annex38/sites/${siteId}/periods/${period}/filings`, { method: 'POST' });
}

export function fetchAnnex38Archive() {
  return requestJson<{ filings: ComplianceFilingRecord[] }>('/annex38/filings');
}

export function markAnnex38Submitted(id: string, input: { submissionRef: string; submittedAt?: string }) {
  return requestJson<ComplianceFilingRecord>(`/annex38/filings/${id}/submitted`, { method: 'POST', body: JSON.stringify(input) });
}

export function annex38DownloadPath(id: string) {
  return `/annex38/filings/${id}/download`;
}

export function vatExportPath(period: string, ledger: 'purchases' | 'sales' | 'return', lang: string) {
  return `/vat/periods/${period}/export?${queryString({ ledger, lang })}`;
}

/** Fetches a file with the session (refreshing it once on 401) and hands it to the browser as a download. */
export async function downloadFile(path: string, fallbackName: string) {
  const send = () => fetch(path, { credentials: 'include' });
  let response = await send();
  if (response.status === 401 && (await refreshSession())) response = await send();
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new ApiError(errorMessage(payload, 'The download failed. Please try again.'), response.status, null, []);
  }
  const blob = await response.blob();
  const name = /filename="([^"]+)"/.exec(response.headers.get('Content-Disposition') ?? '')?.[1] ?? fallbackName;
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function retryDocumentExtraction(id: string, captureId: string) {
  return requestJson<DocumentDetailResponse>(`/documents/${id}/captures/${captureId}/retry-extraction`, {
    method: 'POST',
  });
}
