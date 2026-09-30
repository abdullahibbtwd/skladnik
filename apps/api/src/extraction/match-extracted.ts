import type { UnitOfMeasure } from '@skladnik/shared';

export function normalizeLookup(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function resolveUnit(raw: string | null | undefined, aliases: { raw: string; unit: UnitOfMeasure }[]): UnitOfMeasure {
  if (!raw?.trim()) return 'PCS';
  const needle = normalizeLookup(raw);
  const hit = aliases.find((alias) => normalizeLookup(alias.raw) === needle);
  return hit?.unit ?? 'OTHER';
}

export function counterpartyFromExtracted(
  documentType: 'INVOICE' | 'RECEIPT' | 'PROTOCOL' | 'CREDIT_NOTE',
  extracted: {
    supplier: { name: string | null; taxId: string | null; address: string | null; mol?: string | null; phone?: string | null };
    client: { name: string | null; taxId: string | null; address: string | null };
  },
) {
  return documentType === 'PROTOCOL' ? extracted.client : extracted.supplier;
}

export function looksLikeBarcode(value: string | null | undefined) {
  return Boolean(value && /^\d{8,14}$/.test(value.trim()));
}

/**
 * Price and discount to store for a read line. Totals are never taken from the model: the server
 * works them out from these, and the printed line total is only kept for comparison.
 */
export function linePricing(line: {
  qty: number;
  unitPrice: number | null;
  discountPercent: number | null;
  finalUnitPrice: number | null;
  lineTotal: number | null;
}): { unitPrice: number; discountPercent: number } {
  if (line.unitPrice !== null) {
    if (line.discountPercent !== null) return { unitPrice: line.unitPrice, discountPercent: line.discountPercent };
    if (line.finalUnitPrice !== null && line.unitPrice > 0 && line.finalUnitPrice < line.unitPrice) {
      const discountPercent = Math.round((1 - line.finalUnitPrice / line.unitPrice) * 10000) / 100;
      return { unitPrice: line.unitPrice, discountPercent };
    }
    return { unitPrice: line.unitPrice, discountPercent: 0 };
  }
  if (line.finalUnitPrice !== null) return { unitPrice: line.finalUnitPrice, discountPercent: 0 };
  if (line.lineTotal !== null && line.qty > 0) return { unitPrice: Math.round((line.lineTotal / line.qty) * 10000) / 10000, discountPercent: 0 };
  return { unitPrice: 0, discountPercent: 0 };
}

export function unitPriceFromLine(line: {
  qty: number;
  unitPrice: number | null;
  finalUnitPrice: number | null;
  lineTotal: number | null;
}) {
  if (line.unitPrice !== null) return line.unitPrice;
  if (line.finalUnitPrice !== null) return line.finalUnitPrice;
  if (line.lineTotal !== null && line.qty > 0) return line.lineTotal / line.qty;
  return 0;
}
