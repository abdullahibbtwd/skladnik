import type { DocumentStatus, DocumentType, UnitOfMeasure, WriteOffReason } from '@skladnik/shared';
import i18n from '../i18n';
import type { DocumentListItem, StockLevel } from './workspace-api';

/** One batch with stock left at the active site. */
export type StockLine = {
  productId: string;
  sku: string;
  name: string;
  unit: UnitOfMeasure;
  batchId: string;
  batch: string;
  expiryDate: string;
  qty: number;
  unitPrice: number;
  daysLeft: number;
};

export type LowStockLine = {
  productId: string;
  name: string;
  qty: number;
  minStock: number;
};

export type StockOperation = {
  id: string;
  type: DocumentType;
  writeOffReason: WriteOffReason | null;
  document: string;
  date: { today: boolean; label: string };
  status: DocumentStatus;
};

export type Notice = { text: string; to?: string };

export type PendingInvoice = {
  id: string;
  supplier: string;
  number: string;
  total: string;
  reason: string;
};

/** Bulgaria has used the euro since 1 Jan 2026; "12,50 €" in Bulgarian, "€12.50" in English. */
export function formatEuro(value: number) {
  const locale = i18n.language?.startsWith('bg') ? 'bg-BG' : 'en-IE';
  return new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR' }).format(value);
}

export function expiryTone(days: number) {
  if (days <= 3) return 'critical' as const;
  if (days <= 7) return 'urgent' as const;
  if (days <= 14) return 'warning' as const;
  if (days <= 30) return 'watch' as const;
  return 'safe' as const;
}

/** Whole days from `today` (local) to a YYYY-MM-DD date; negative once expired. */
export function daysUntil(isoDate: string, today = new Date()) {
  const [year, month, day] = isoDate.split('-').map(Number);
  const start = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((Date.UTC(year, month - 1, day) - start) / 86_400_000);
}

/** `issuedOn` is a calendar date with no time of day, so this never shows a clock time. */
function formatOpDate(isoDate: string, today: Date) {
  const day = isoDate.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return { today: false, label: '' };
  if (daysUntil(day, today) === 0) return { today: true, label: '' };
  return {
    today: false,
    label: new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' }),
  };
}

export const EXPIRY_WINDOWS = [30, 14, 7, 3] as const;

/** `stock` is undefined until the site's stock has loaded, so screens can show "—" instead of zeros. */
export function buildDashboardState(documents: DocumentListItem[] = [], stock?: StockLevel[], today = new Date()) {
  const pendingDocs = documents.filter((doc) => doc.status === 'DRAFT' || doc.status === 'REVIEW');
  const operations: StockOperation[] = [...documents]
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, 8)
    .map((doc) => ({
      id: doc.id,
      type: doc.type,
      writeOffReason: doc.writeOffReason,
      document: doc.documentNumber,
      date: formatOpDate(doc.issuedOn || doc.createdAt, today),
      status: doc.status,
    }));

  const items = stock ?? [];
  const fefoBoard: StockLine[] = items
    .flatMap((item) =>
      item.batches
        .filter((batch) => batch.expiryDate)
        .map((batch) => ({
          productId: item.productId,
          sku: item.code,
          name: item.name,
          unit: item.unit,
          batchId: batch.batchId,
          batch: batch.batchNumber,
          expiryDate: batch.expiryDate!,
          qty: batch.onHand,
          unitPrice: batch.unitCost,
          daysLeft: daysUntil(batch.expiryDate!, today),
        })),
    )
    .sort((a, b) => a.daysLeft - b.daysLeft || a.name.localeCompare(b.name));

  const expiring = Object.fromEntries(
    EXPIRY_WINDOWS.map((days) => [days, fefoBoard.filter((line) => line.daysLeft <= days).length]),
  ) as Record<(typeof EXPIRY_WINDOWS)[number], number>;

  const lowStock: LowStockLine[] = items
    .filter((item) => item.status !== 'OK')
    .map((item) => ({ productId: item.productId, name: item.name, qty: item.onHand, minStock: item.minStock }));

  const inStock = items.filter((item) => item.onHand > 0);

  return {
    stockReady: stock !== undefined,
    operations,
    pending: pendingDocs.map((doc) => ({
      id: doc.id,
      supplier: doc.partner?.name ?? '',
      number: doc.documentNumber,
      total: '',
      reason: doc.status,
    })),
    stockValue: inStock.reduce((sum, item) => sum + item.value, 0),
    reorderCount: items.filter((item) => item.suggestedOrder !== null).length,
    inStockCount: inStock.length,
    expiring,
    expired: fefoBoard.filter((line) => line.daysLeft < 0).length,
    lowStock,
    fefoBoard,
    notifications: [] as Notice[],
  };
}

export type DashboardState = ReturnType<typeof buildDashboardState>;
