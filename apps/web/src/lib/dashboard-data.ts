import type { DocumentStatus, DocumentType } from '@skladnik/shared';
import type { DocumentListItem } from './workspace-api';

export type StockLine = {
  sku: string;
  name: string;
  batch: string;
  qty: number;
  minStock: number;
  unitPrice: number;
  daysLeft: number;
  invoice: string;
  siteId: string;
};

export type StockOperation = {
  id: string;
  type: DocumentType;
  document: string;
  time: string;
  status: DocumentStatus;
};

export type PendingInvoice = {
  id: string;
  supplier: string;
  number: string;
  total: string;
  reason: string;
};

export function formatEuro(value: number) {
  return new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' }).format(value);
}

export function expiryTone(days: number) {
  if (days <= 3) return 'critical' as const;
  if (days <= 7) return 'urgent' as const;
  if (days <= 14) return 'warning' as const;
  if (days <= 30) return 'watch' as const;
  return 'safe' as const;
}

function formatOpTime(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const sameDay = date.toDateString() === new Date().toDateString();
  return sameDay
    ? date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

const EMPTY_EXPIRING = { 3: 0, 7: 0, 14: 0, 30: 0 };

export function buildDashboardState(documents: DocumentListItem[] = []) {
  const pendingDocs = documents.filter((doc) => doc.status === 'DRAFT' || doc.status === 'REVIEW');
  const operations: StockOperation[] = [...documents]
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, 8)
    .map((doc) => ({
      id: doc.id,
      type: doc.type,
      document: doc.documentNumber,
      time: formatOpTime(doc.issuedOn || doc.createdAt),
      status: doc.status,
    }));

  return {
    lines: [] as StockLine[],
    operations,
    pending: pendingDocs.map((doc) => ({
      id: doc.id,
      supplier: doc.partner?.name ?? '',
      number: doc.documentNumber,
      total: '',
      reason: doc.status,
    })),
    stockValue: 0,
    expiring: EMPTY_EXPIRING,
    lowStock: [] as StockLine[],
    fefoBoard: [] as StockLine[],
    catalogCount: 0,
    notifications: [] as string[],
  };
}

export type DashboardState = ReturnType<typeof buildDashboardState>;
