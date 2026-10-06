import type { InvoiceStatus, SubscriptionPlan, SubscriptionStatus } from '@skladnik/shared';

export type PlatformSessionUser = {
  id: string;
  email: string;
  name: string;
  totpEnabled: boolean;
};

export type PlatformInvoiceSummary = {
  id: string;
  number: string;
  title?: string;
  status: InvoiceStatus;
  currency: string;
  vatRate?: number;
  subtotalMinor?: number;
  vatMinor?: number;
  totalMinor: number;
  issuedAt: string;
  paidAt?: string | null;
  voidedAt?: string | null;
  version?: number;
};

export type PlatformSubscriptionListItem = {
  id: string;
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  maxUsers: number;
  termMonths: number;
  startsAt: string | null;
  expiresAt: string | null;
  companyNameHint: string | null;
  contactEmail: string | null;
  externalInvoiceRef: string | null;
  version: number;
  company: { id: string; name: string; eik: string | null } | null;
  openCodePrefix: string | null;
  openCodeExpiresAt: string | null;
  codeRevealable: boolean;
  latestInvoice: PlatformInvoiceSummary | null;
  activatedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PlatformSubscriptionDetail = PlatformSubscriptionListItem & {
  notes: string | null;
  invoices: PlatformInvoiceSummary[];
  activationCodes: {
    id: string;
    codePrefix: string;
    expiresAt: string;
    redeemedAt: string | null;
    revokedAt: string | null;
    createdAt: string;
    revealable: boolean;
  }[];
  events: {
    id: string;
    type: string;
    fromStatus: SubscriptionStatus | null;
    toStatus: SubscriptionStatus | null;
    actorType: string;
    actorId: string | null;
    payload: unknown;
    createdAt: string;
  }[];
};

export type CreateSubscriptionInput = {
  plan: SubscriptionPlan;
  maxUsers: number;
  termMonths: number;
  priceMinor: number;
  currency: string;
  vatRate: number;
  buyerName: string;
  buyerEik: string;
  buyerAddress: string;
  buyerEmail: string;
  invoiceTitle?: string;
  companyNameHint?: string;
  contactEmail?: string;
  notes?: string;
  externalInvoiceRef?: string;
};

export type UpdateSubscriptionInput = Partial<
  Pick<
    CreateSubscriptionInput,
    'plan' | 'maxUsers' | 'termMonths' | 'companyNameHint' | 'contactEmail' | 'notes' | 'externalInvoiceRef'
  >
>;

export class PlatformApiError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly payload: unknown;

  constructor(status: number, message: string, payload?: unknown, code?: string | null) {
    super(message);
    this.name = 'PlatformApiError';
    this.status = status;
    this.code = code ?? null;
    this.payload = payload ?? null;
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

function errorCode(payload: unknown): string | null {
  if (payload && typeof payload === 'object' && 'code' in payload) {
    const code = (payload as { code: unknown }).code;
    if (typeof code === 'string') return code;
  }
  return null;
}

async function readJson(response: Response) {
  return response.json().catch(() => ({}));
}

let refreshing: Promise<boolean> | null = null;

export function refreshPlatformSession(): Promise<boolean> {
  refreshing ??= fetch('/platform-auth/refresh', { method: 'POST', credentials: 'include' })
    .then(
      (response) => response.ok,
      () => false,
    )
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

async function platformFetch(path: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(path, {
    ...init,
    credentials: 'include',
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  });
  if (response.status !== 401) return response;
  const refreshed = await refreshPlatformSession();
  if (!refreshed) return response;
  return fetch(path, {
    ...init,
    credentials: 'include',
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  });
}

async function platformJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await platformFetch(path, init);
  const payload = await readJson(response);
  if (!response.ok) {
    throw new PlatformApiError(
      response.status,
      errorMessage(payload, 'Request failed'),
      payload,
      errorCode(payload),
    );
  }
  return payload as T;
}

export async function fetchPlatformMe(): Promise<PlatformSessionUser | null> {
  const first = await fetch('/platform-auth/me', { credentials: 'include' });
  if (first.status === 401) {
    const refreshed = await refreshPlatformSession();
    if (!refreshed) return null;
    const retry = await fetch('/platform-auth/me', { credentials: 'include' });
    if (!retry.ok) return null;
    const payload = (await retry.json()) as PlatformSessionUser;
    return payload;
  }
  if (!first.ok) throw new Error('Could not verify the platform session.');
  return (await first.json()) as PlatformSessionUser;
}

export type PlatformLoginResult =
  | { status: 'TOTP_REQUIRED' }
  | { status: 'TOTP_ENROLL_REQUIRED' };

export async function platformLogin(email: string, password: string): Promise<PlatformLoginResult> {
  return platformJson('/platform-auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export async function platformVerifyTotp(code: string): Promise<{ user: PlatformSessionUser }> {
  return platformJson('/platform-auth/totp/verify', {
    method: 'POST',
    body: JSON.stringify({ code }),
  });
}

export async function platformEnrollTotp(): Promise<{ otpauthUrl: string; secret: string }> {
  return platformJson('/platform-auth/totp/enroll', { method: 'POST' });
}

export async function platformConfirmTotp(code: string): Promise<{ user: PlatformSessionUser }> {
  return platformJson('/platform-auth/totp/confirm', {
    method: 'POST',
    body: JSON.stringify({ code }),
  });
}

export async function platformLogout(): Promise<void> {
  try {
    await fetch('/platform-auth/logout', { method: 'POST', credentials: 'include' });
  } catch {
    // Local session cleared regardless.
  }
}

export type PlatformSubscriptionsPage = {
  subscriptions: PlatformSubscriptionListItem[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type PlatformStats = {
  total: number;
  pending: number;
  active: number;
  trial: number;
  suspended: number;
  expired: number;
  revoked: number;
  issuedInvoices: number;
  paidInvoices: number;
  voidInvoices: number;
  totalPaidMinor: number;
};

export async function listPlatformSubscriptions(params?: {
  status?: SubscriptionStatus;
  plan?: SubscriptionPlan;
  q?: string;
  page?: number;
  pageSize?: number;
}): Promise<PlatformSubscriptionsPage> {
  const query = new URLSearchParams();
  if (params?.status) query.set('status', params.status);
  if (params?.plan) query.set('plan', params.plan);
  if (params?.q?.trim()) query.set('q', params.q.trim());
  if (params?.page != null) query.set('page', String(params.page));
  if (params?.pageSize != null) query.set('pageSize', String(params.pageSize));
  const qs = query.toString();
  return platformJson(`/platform/subscriptions${qs ? `?${qs}` : ''}`);
}

export async function fetchPlatformStats(): Promise<PlatformStats> {
  return platformJson('/platform/subscriptions/stats');
}

export async function getPlatformSubscription(id: string): Promise<{ subscription: PlatformSubscriptionDetail }> {
  return platformJson(`/platform/subscriptions/${id}`);
}

export async function createPlatformSubscription(
  input: CreateSubscriptionInput,
  idempotencyKey: string,
): Promise<{ subscription: PlatformSubscriptionDetail; activationCode: string; invoiceId: string }> {
  return platformJson('/platform/subscriptions', {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify(input),
  });
}

export async function updatePlatformSubscription(
  id: string,
  input: UpdateSubscriptionInput,
): Promise<{ subscription: PlatformSubscriptionDetail }> {
  return platformJson(`/platform/subscriptions/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export async function regeneratePlatformCode(
  id: string,
): Promise<{ subscription: PlatformSubscriptionDetail; activationCode: string }> {
  return platformJson(`/platform/subscriptions/${id}/regenerate-code`, { method: 'POST' });
}

export async function transitionPlatformSubscription(
  id: string,
  input: { toStatus: SubscriptionStatus; reason?: string; version: number },
): Promise<{ subscription: PlatformSubscriptionDetail }> {
  return platformJson(`/platform/subscriptions/${id}/transition`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function revealPlatformActivationCode(
  id: string,
  totpCode: string,
): Promise<{ activationCode: string; codePrefix: string; expiresAt: string }> {
  return platformJson(`/platform/subscriptions/${id}/reveal-code`, {
    method: 'POST',
    headers: { 'Cache-Control': 'no-store' },
    body: JSON.stringify({ totpCode }),
  });
}

export async function markPlatformInvoicePaid(
  subscriptionId: string,
  invoiceId: string,
  input: { paymentReference: string; paymentDate?: string },
): Promise<{ subscription: PlatformSubscriptionDetail }> {
  return platformJson(`/platform/subscriptions/${subscriptionId}/invoices/${invoiceId}/mark-paid`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function voidPlatformInvoice(
  subscriptionId: string,
  invoiceId: string,
  input: { reason: string },
): Promise<{ subscription: PlatformSubscriptionDetail }> {
  return platformJson(`/platform/subscriptions/${subscriptionId}/invoices/${invoiceId}/void`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function downloadPlatformInvoicePdf(subscriptionId: string, invoiceId: string, fileName: string) {
  const response = await platformFetch(`/platform/subscriptions/${subscriptionId}/invoices/${invoiceId}/pdf`);
  if (!response.ok) {
    const payload = await readJson(response);
    throw new PlatformApiError(response.status, errorMessage(payload, 'PDF download failed'), payload);
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.rel = 'noopener';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}

export type PlatformBillingSettings = {
  sellerName: string;
  sellerEik: string;
  sellerAddress: string;
  sellerEmail: string;
  configured: boolean;
  updatedAt: string;
};

export async function getPlatformBillingSettings(): Promise<PlatformBillingSettings> {
  return platformJson('/platform/settings/billing');
}

export async function updatePlatformBillingSettings(input: {
  sellerName: string;
  sellerEik: string;
  sellerAddress: string;
  sellerEmail: string;
}): Promise<PlatformBillingSettings> {
  return platformJson('/platform/settings/billing', {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}
