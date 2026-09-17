import { z } from 'zod';

const emptyToNull = (value: unknown) => {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  return value;
};

const nullableString = z.preprocess(emptyToNull, z.string().nullable()).optional().transform((value) => value ?? null);

const nullableNumber = z.preprocess((value) => {
  const cleaned = emptyToNull(value);
  if (cleaned === null) return null;
  if (typeof cleaned === 'number') return Number.isFinite(cleaned) ? cleaned : null;
  if (typeof cleaned === 'string') {
    const parsed = Number(cleaned.replace(',', '.').replace(/[^\d.-]/g, ''));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}, z.number().nullable());

const requiredNumber = z.preprocess((value) => {
  const cleaned = emptyToNull(value);
  if (cleaned === null) return 0;
  if (typeof cleaned === 'number') return Number.isFinite(cleaned) ? cleaned : 0;
  if (typeof cleaned === 'string') {
    const parsed = Number(cleaned.replace(',', '.').replace(/[^\d.-]/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}, z.number());

export const ExtractedLineSchema = z.object({
  supplierCode: nullableString,
  ocrDescription: z.preprocess((value) => (typeof value === 'string' ? value : ''), z.string()),
  ocrUnit: nullableString,
  qty: requiredNumber,
  unitPrice: nullableNumber,
  discountPercent: nullableNumber,
  finalUnitPrice: nullableNumber,
  lineTotal: nullableNumber,
  vatRate: nullableNumber,
  ocrBatchNumber: nullableString,
  ocrExpiryDate: nullableString,
});

export const ExtractedDocumentSchema = z.object({
  documentNumber: nullableString,
  issuedOn: nullableString,
  documentType: z.preprocess(
    emptyToNull,
    z.enum(['INVOICE', 'RECEIPT', 'PROTOCOL', 'CREDIT_NOTE']).nullable(),
  ),
  supplier: z.object({
    name: nullableString,
    taxId: nullableString,
    address: nullableString,
    mol: nullableString,
    phone: nullableString,
  }).default({ name: null, taxId: null, address: null, mol: null, phone: null }),
  client: z.object({
    name: nullableString,
    taxId: nullableString,
    address: nullableString,
  }).default({ name: null, taxId: null, address: null }),
  deliveryAddress: nullableString,
  lines: z.array(ExtractedLineSchema).default([]),
  grossTotal: nullableNumber,
  confidence: z.enum(['high', 'medium', 'low']).default('medium'),
});

export type ExtractedDocument = z.infer<typeof ExtractedDocumentSchema>;
export type ExtractedLine = z.infer<typeof ExtractedLineSchema>;

export function stripJsonFences(text: string) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return (fenced?.[1] ?? trimmed).trim();
}

export function parseExtractedDocument(payload: unknown): { ok: true; data: ExtractedDocument } | { ok: false; error: string } {
  let value = payload;
  if (typeof payload === 'string') {
    try {
      value = JSON.parse(stripJsonFences(payload));
    } catch {
      return { ok: false, error: 'Model did not return valid JSON' };
    }
  }
  const parsed = ExtractedDocumentSchema.safeParse(value);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((issue) => issue.message).join('; ') };
  }
  return { ok: true, data: parsed.data };
}
