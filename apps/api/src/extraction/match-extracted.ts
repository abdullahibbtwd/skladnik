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

export function pendingProductCode(description: string, index: number) {
  const slug = description
    .normalize('NFKD')
    .replace(/[^\w]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 18)
    .toUpperCase() || 'LINE';
  return `OCR-${Date.now().toString(36)}-${index}-${slug}`.slice(0, 64);
}

export function looksLikeBarcode(value: string | null | undefined) {
  return Boolean(value && /^\d{8,14}$/.test(value.trim()));
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
