import type {
  CaptureExtractionStatus,
  DocumentStatus,
  DocumentType,
  PartnerKind,
  ProductStatus,
  SiteType,
  StockDirection,
  UnitOfMeasure,
  UserRole,
} from '@skladnik/shared';

export type SiteRecord = {
  id: string;
  name: string;
  type: SiteType;
  address: string | null;
  isActive: boolean;
  deactivatedAt: string | null;
  manager: { id: string; name: string; email: string; isActive: boolean } | null;
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
  taxId: string | null;
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
  vatRate: number;
  purchasePrice: number;
  sellingPrice: number;
  minStock: number;
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
  vatRate: number;
  purchasePrice: number;
  sellingPrice: number;
  minStock?: number;
  batchTracking?: boolean;
  status?: ProductStatus;
  barcodes?: string[];
};

export const workspaceKeys = {
  sites: ['workspace', 'sites'] as const,
  users: ['workspace', 'users'] as const,
  invites: ['workspace', 'invites'] as const,
  invite: (token: string) => ['workspace', 'invite', token] as const,
  productGroups: ['workspace', 'product-groups'] as const,
  partners: ['workspace', 'partners'] as const,
  products: (filters?: { groupId?: string; status?: string; q?: string }) =>
    ['workspace', 'products', filters ?? {}] as const,
  unitAliases: ['workspace', 'unit-aliases'] as const,
  documents: (filters?: { status?: string; siteId?: string; type?: string }) =>
    ['workspace', 'documents', filters ?? {}] as const,
  document: (id: string) => ['workspace', 'document', id] as const,
};

function errorMessage(payload: unknown, fallback: string) {
  if (payload && typeof payload === 'object' && 'message' in payload) {
    const message = (payload as { message: unknown }).message;
    if (typeof message === 'string') return message;
    if (Array.isArray(message)) return message.filter((item) => typeof item === 'string').join('. ');
  }
  return fallback;
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const { headers: initHeaders, ...rest } = init ?? {};
  const isFormData = typeof FormData !== 'undefined' && rest.body instanceof FormData;
  const headers = new Headers(initHeaders);
  if (!isFormData && rest.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const response = await fetch(path, {
    credentials: 'include',
    ...rest,
    headers,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(errorMessage(payload, 'Something went wrong. Please try again.'));
  }
  return payload as T;
}

export function fetchSites() {
  return requestJson<{ sites: SiteRecord[] }>('/sites');
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

export function createPartner(input: {
  name: string;
  kind: PartnerKind;
  taxId?: string;
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
    taxId?: string | null;
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

export function fetchProducts(filters?: { groupId?: string; status?: ProductStatus; q?: string }) {
  const params = new URLSearchParams();
  if (filters?.groupId) params.set('groupId', filters.groupId);
  if (filters?.status) params.set('status', filters.status);
  if (filters?.q) params.set('q', filters.q);
  const query = params.toString();
  return requestJson<{ products: ProductRecord[] }>(`/products${query ? `?${query}` : ''}`);
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
  partner: { id: string; name: string; kind: PartnerKind; taxId: string | null } | null;
  site: { id: string; name: string; type: SiteType; isActive: boolean };
  lineCount: number;
  captureCount: number;
  createdAt: string;
  postedAt: string | null;
};

export type DocumentLineRecord = {
  id: string;
  position: number;
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
  quantity: number;
  unitPrice: number;
  discountPercent: number;
  finalUnitPrice: number | null;
  lineTotal: number | null;
  vatRate: number;
  unit: UnitOfMeasure | null;
  batchNumber: string | null;
  expiryDate: string | null;
  batch: { id: string; batchNumber: string; expiryDate: string | null; quantityRemaining: number } | null;
  verified: boolean;
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
  extraction: {
    confidence: 'high' | 'medium' | 'low' | null;
    reading: boolean;
  };
  lines: DocumentLineRecord[];
  captures: DocumentCaptureRecord[];
};

export type DocumentDetailResponse = {
  document: DocumentDetail;
  posting: { ok: boolean; errors: string[] };
};

export type DocumentWriteInput = {
  type: DocumentType;
  siteId: string;
  partnerId?: string;
  documentNumber: string;
  issuedOn: string;
  direction?: StockDirection;
  deliveryAddress?: string;
  notes?: string;
};

export type DocumentUpdateInput = Partial<Omit<DocumentWriteInput, 'partnerId'>> & {
  partnerId?: string | null;
};

export type DocumentLineWriteInput = {
  productId: string;
  quantity: number;
  unitPrice: number;
  discountPercent?: number;
  vatRate?: number;
  batchNumber?: string;
  expiryDate?: string;
};

export function fetchDocuments(filters?: { status?: DocumentStatus; siteId?: string; type?: DocumentType }) {
  const params = new URLSearchParams();
  if (filters?.status) params.set('status', filters.status);
  if (filters?.siteId) params.set('siteId', filters.siteId);
  if (filters?.type) params.set('type', filters.type);
  const query = params.toString();
  return requestJson<{ documents: DocumentListItem[] }>(`/documents${query ? `?${query}` : ''}`);
}

export function fetchDocument(id: string) {
  return requestJson<DocumentDetailResponse>(`/documents/${id}`);
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

export function postDocument(id: string) {
  return requestJson<DocumentDetailResponse>(`/documents/${id}/post`, { method: 'POST' });
}

export function cancelDocument(id: string) {
  return requestJson<DocumentDetailResponse>(`/documents/${id}/cancel`, { method: 'POST' });
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

export function retryDocumentExtraction(id: string, captureId: string) {
  return requestJson<DocumentDetailResponse>(`/documents/${id}/captures/${captureId}/retry-extraction`, {
    method: 'POST',
  });
}
