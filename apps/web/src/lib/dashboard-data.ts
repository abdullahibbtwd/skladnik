import type { SampleInvoice } from '../components/HeroSection';
import { SAMPLE_INVOICES } from '../components/HeroSection';

export type SiteOption = {
  id: string;
  name: string;
  type: 'STORE' | 'WAREHOUSE' | 'KITCHEN';
};

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
  type: 'OCR intake' | 'Goods received' | 'POS sale' | 'Write-off';
  document: string;
  time: string;
  status: 'Posted' | 'Pending' | 'Review';
};

export type PendingInvoice = {
  id: string;
  supplier: string;
  number: string;
  total: string;
  reason: string;
};

export const DASHBOARD_SITES: SiteOption[] = [
  { id: 'central', name: 'Store #1 - Central', type: 'STORE' },
  { id: 'warehouse', name: 'Warehouse', type: 'WAREHOUSE' },
];

const BASE_STOCK: StockLine[] = [
  { sku: 'EAN-590123401', name: 'Fresh Milk 3.2% 1L', batch: 'B-1402-A', qty: 18, minStock: 24, unitPrice: 1.15, daysLeft: 3, invoice: 'FV/2026/09/1402', siteId: 'central' },
  { sku: 'EAN-590882109', name: 'Butter Croissants (Box 40)', batch: 'B-8842-C', qty: 3, minStock: 4, unitPrice: 32, daysLeft: 2, invoice: 'GGB-8842-26', siteId: 'central' },
  { sku: 'EAN-590882110', name: 'Artisan Sourdough Loaf 750g', batch: 'B-8842-D', qty: 11, minStock: 12, unitPrice: 2.4, daysLeft: 3, invoice: 'GGB-8842-26', siteId: 'central' },
  { sku: 'EAN-590442308', name: 'Fresh Pressed Cold Orange 1L', batch: 'B-9931-F', qty: 22, minStock: 16, unitPrice: 2.65, daysLeft: 7, invoice: 'INV-BEV-9931', siteId: 'central' },
  { sku: 'EAN-590123403', name: 'Bio Natural Yogurt 400g', batch: 'B-1402-C', qty: 40, minStock: 20, unitPrice: 0.85, daysLeft: 9, invoice: 'FV/2026/09/1402', siteId: 'central' },
  { sku: 'EAN-590123402', name: 'Farm Butter 200g (82%)', batch: 'B-1402-B', qty: 28, minStock: 16, unitPrice: 1.95, daysLeft: 14, invoice: 'FV/2026/09/1402', siteId: 'central' },
  { sku: 'EAN-590442319', name: 'Nitro Cold Brew Coffee 250ml', batch: 'B-9931-G', qty: 48, minStock: 24, unitPrice: 1.7, daysLeft: 28, invoice: 'INV-BEV-9931', siteId: 'warehouse' },
  { sku: 'EAN-590123404', name: 'Aged Cheddar Block 2.5kg', batch: 'B-1402-D', qty: 6, minStock: 4, unitPrice: 24.5, daysLeft: 92, invoice: 'FV/2026/09/1402', siteId: 'warehouse' },
  { sku: 'EAN-590882115', name: 'Fine Wheat Flour Type 500', batch: 'B-8842-E', qty: 2, minStock: 6, unitPrice: 19.5, daysLeft: 180, invoice: 'GGB-8842-26', siteId: 'warehouse' },
  { sku: 'EAN-590442301', name: 'Spring Water 500ml (24pk)', batch: 'B-9931-H', qty: 15, minStock: 8, unitPrice: 8.4, daysLeft: 365, invoice: 'INV-BEV-9931', siteId: 'warehouse' },
];

const BASE_OPERATIONS: StockOperation[] = [
  { id: 'op-1', type: 'OCR intake', document: 'FV/2026/09/1402', time: '08:14', status: 'Posted' },
  { id: 'op-2', type: 'Goods received', document: 'GGB-8842-26', time: '08:41', status: 'Posted' },
  { id: 'op-3', type: 'POS sale', document: 'POS-2041', time: '09:06', status: 'Posted' },
  { id: 'op-4', type: 'OCR intake', document: 'INV-BEV-9931', time: '09:22', status: 'Review' },
  { id: 'op-5', type: 'Write-off', document: 'WO-118', time: '09:48', status: 'Posted' },
  { id: 'op-6', type: 'POS sale', document: 'POS-2048', time: '10:11', status: 'Posted' },
];

const BASE_PENDING: PendingInvoice[] = [
  { id: 'pend-1', supplier: 'Vanguard Beverage Distribution', number: 'INV-BEV-9931', total: '€ 684.00', reason: '2 SKUs need catalog match' },
  { id: 'pend-2', supplier: 'Metro Fresh Dairy Sp. z o.o.', number: 'FV/2026/09/1411', total: '€ 156.80', reason: 'VAT rate conflict on line 3' },
];

export const TODAYS_TURNOVER = 1240.5;

export function parseEuro(value: string) {
  return Number(value.replace(/[^\d.]/g, '')) || 0;
}

export function formatEuro(value: number) {
  return new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' }).format(value);
}

export function daysToBand(days: number): 3 | 7 | 14 | 30 | null {
  if (days <= 3) return 3;
  if (days <= 7) return 7;
  if (days <= 14) return 14;
  if (days <= 30) return 30;
  return null;
}

export function expiryTone(days: number) {
  if (days <= 3) return 'critical' as const;
  if (days <= 7) return 'urgent' as const;
  if (days <= 14) return 'warning' as const;
  if (days <= 30) return 'watch' as const;
  return 'safe' as const;
}

function daysFromSample(item: SampleInvoice['items'][number]) {
  const match = item.fefoLabel.match(/(\d+)d/);
  return match ? Number(match[1]) : 90;
}

export function buildDashboardState(committed: SampleInvoice[], siteId: string) {
  const extras: StockLine[] = committed.flatMap((invoice) =>
    invoice.items.map((item, index) => ({
      sku: item.sku,
      name: item.description,
      batch: `SCAN-${invoice.invNumber.slice(-4)}-${index + 1}`,
      qty: item.qty,
      minStock: Math.max(4, Math.round(item.qty * 0.25)),
      unitPrice: parseEuro(item.unitPrice),
      daysLeft: daysFromSample(item),
      invoice: invoice.invNumber,
      siteId: 'central',
    })),
  );

  const stock = [...extras, ...BASE_STOCK].filter((line) => line.siteId === siteId);
  const unique = new Map<string, StockLine>();
  for (const line of stock) unique.set(`${line.sku}-${line.batch}`, line);
  const lines = [...unique.values()];

  const operations: StockOperation[] = [
    ...committed.map((invoice, index) => ({
      id: `commit-${invoice.id}`,
      type: 'OCR intake' as const,
      document: invoice.invNumber,
      time: `${String(10 + index).padStart(2, '0')}:${String(12 + index * 3).padStart(2, '0')}`,
      status: 'Posted' as const,
    })),
    ...BASE_OPERATIONS,
  ];

  const pending = committed.some((invoice) => invoice.id === 'beverages')
    ? BASE_PENDING.filter((row) => row.id !== 'pend-1')
    : BASE_PENDING;

  const stockValue = lines.reduce((sum, line) => sum + line.qty * line.unitPrice, 0);
  const expiring = {
    3: lines.filter((line) => line.daysLeft <= 3).length,
    7: lines.filter((line) => line.daysLeft <= 7).length,
    14: lines.filter((line) => line.daysLeft <= 14).length,
    30: lines.filter((line) => line.daysLeft <= 30).length,
  };
  const lowStock = lines.filter((line) => line.qty <= line.minStock);
  const fefoBoard = [...lines].filter((line) => line.daysLeft <= 30).sort((a, b) => a.daysLeft - b.daysLeft);

  return {
    lines,
    operations: operations.slice(0, 8),
    pending,
    stockValue,
    expiring,
    lowStock,
    fefoBoard,
    catalogCount: lines.length,
    notifications: [
      `${expiring[3]} batches hit the 3-day FEFO threshold`,
      `${pending.length} invoices waiting for review`,
      `${lowStock.length} items at or below min stock`,
    ],
    seedInvoices: SAMPLE_INVOICES,
  };
}

export type DashboardState = ReturnType<typeof buildDashboardState>;
