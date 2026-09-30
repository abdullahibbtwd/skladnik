import { DEFAULT_EXPIRY_WINDOWS, expiryBucketCounts, expiryLevel, type DocumentStatus, type DocumentType, type UnitOfMeasure, type WriteOffReason } from '@skladnik/shared';
import i18n from '../i18n';
import { formatEuro as formatEuroValue, formatShortDay } from './format';
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
  createdById?: string | null;
};

/** Bulgaria has used the euro since 1 Jan 2026; "12,50 €" in Bulgarian, "€12.50" in English. */
export function formatEuro(value: number) {
  return formatEuroValue(value, i18n.language);
}

/** Colour level of a batch `days` from expiry, by the company's thresholds (Settings → Stock rules). */
export function expiryTone(days: number, windows: readonly number[] = DEFAULT_EXPIRY_WINDOWS) {
  return expiryLevel(days, windows);
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
    label: formatShortDay(day, i18n.language),
  };
}

/** `stock` is undefined until the site's stock has loaded, so screens can show "—" instead of zeros. */
export function buildDashboardState(
  documents: DocumentListItem[] = [],
  stock?: StockLevel[],
  windows: readonly number[] = DEFAULT_EXPIRY_WINDOWS,
  today = new Date(),
) {
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
          unitPrice: batch.unitCost ?? 0,
          daysLeft: daysUntil(batch.expiryDate!, today),
        })),
    )
    .sort((a, b) => a.daysLeft - b.daysLeft || a.name.localeCompare(b.name));

  /** Non-cumulative bands from Settings → Stock rules; expired batches are counted separately. */
  const expiring = expiryBucketCounts(
    fefoBoard.map((line) => line.daysLeft),
    windows,
  );

  const lowStock: LowStockLine[] = items
    .filter((item) => item.status !== 'OK')
    .map((item) => ({ productId: item.productId, name: item.name, qty: item.onHand, minStock: item.minStock }));

  const inStock = items.filter((item) => item.onHand > 0);
  const expiredLines = fefoBoard.filter((line) => line.daysLeft < 0);
  const useFirst = fefoBoard.filter((line) => line.daysLeft >= 0 && line.daysLeft <= (windows[0] ?? 30));

  return {
    stockReady: stock !== undefined,
    operations,
    pending: pendingDocs.map((doc) => ({
      id: doc.id,
      supplier: doc.partner?.name ?? '',
      number: doc.documentNumber,
      total: '',
      reason: doc.status,
      createdById: doc.createdBy?.id ?? null,
    })),
    stockValue: inStock.reduce((sum, item) => sum + (item.value ?? 0), 0),
    reorderCount: items.filter((item) => item.suggestedOrder !== null).length,
    inStockCount: inStock.length,
    expiring,
    expired: expiredLines.length,
    lowStock,
    fefoBoard,
    expiredBoard: expiredLines,
    useFirstBoard: useFirst,
    notifications: [] as Notice[],
  };
}

export type DashboardState = ReturnType<typeof buildDashboardState>;
