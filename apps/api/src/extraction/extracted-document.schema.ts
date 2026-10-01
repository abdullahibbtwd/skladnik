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
  /** Printed row № on the paper (1-based). Used to detect a missing previous page (ACC-04). */
  printedLineNumber: nullableNumber,
  supplierCode: nullableString,
  barcode: nullableString,
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

const PAYMENT_WORDS: [RegExp, 'CASH' | 'CARD' | 'BANK_TRANSFER' | 'OTHER'][] = [
  [/(cash|в брой|наличн)/i, 'CASH'],
  [/(bank|transfer|банк|превод|по сметка)/i, 'BANK_TRANSFER'],
  [/(card|карт|\bpos\b)/i, 'CARD'],
];

/** The model is asked for the enum, but a printed phrase ("По банков път") sometimes comes back instead. */
const paymentMethod = z.preprocess((value) => {
  const cleaned = emptyToNull(value);
  if (typeof cleaned !== 'string') return null;
  const text = cleaned.trim();
  const upper = text.toUpperCase().replace(/[\s-]+/g, '_');
  if (upper === 'CASH' || upper === 'CARD' || upper === 'BANK_TRANSFER' || upper === 'OTHER') return upper;
  return PAYMENT_WORDS.find(([pattern]) => pattern.test(text))?.[1] ?? 'OTHER';
}, z.enum(['CASH', 'CARD', 'BANK_TRANSFER', 'OTHER']).nullable());

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
  taxableBase: nullableNumber,
  vatAmount: nullableNumber,
  grossTotal: nullableNumber,
  /** ACC-04: “Словом: …” text; server parses conservatively — null parse never blocks. */
  amountInWords: nullableString,
  paymentMethod,
  confidence: z.enum(['high', 'medium', 'low']).default('medium'),
  fieldConfidence: z
    .object({
      documentNumber: z.enum(['high', 'medium', 'low']).default('medium'),
      issuedOn: z.enum(['high', 'medium', 'low']).default('medium'),
      supplierName: z.enum(['high', 'medium', 'low']).default('medium'),
      supplierTaxId: z.enum(['high', 'medium', 'low']).default('medium'),
      grossTotal: z.enum(['high', 'medium', 'low']).default('medium'),
    })
    .optional()
    .default({
      documentNumber: 'medium',
      issuedOn: 'medium',
      supplierName: 'medium',
      supplierTaxId: 'medium',
      grossTotal: 'medium',
    }),
});

export type ExtractedDocument = z.infer<typeof ExtractedDocumentSchema>;
export type ExtractedLine = z.infer<typeof ExtractedLineSchema>;

export function stripJsonFences(text: string) {
  const extracted = extractJsonValue(text);
  return extracted === null ? text.trim() : JSON.stringify(extracted);
}

function looksLikeExtractedDocument(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return 'lines' in record || 'documentNumber' in record || 'supplier' in record || 'documentType' in record;
}

function tryJsonParse(text: string): unknown | null {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function jsonObjectSlices(text: string) {
  const slices: string[] = [];
  for (let start = 0; start < text.length; start += 1) {
    if (text[start] !== '{') continue;
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = start; index < text.length; index += 1) {
      const char = text[index];
      if (inString) {
        if (escaped) escaped = false;
        else if (char === '\\') escaped = true;
        else if (char === '"') inString = false;
        continue;
      }
      if (char === '"') inString = true;
      else if (char === '{') depth += 1;
      else if (char === '}') {
        depth -= 1;
        if (depth === 0) {
          slices.push(text.slice(start, index + 1));
          break;
        }
      }
    }
  }
  return slices;
}

export function extractJsonValue(text: string): unknown | null {
  const candidates = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)].map((match) => match[1].trim());
  candidates.push(text.trim());

  const parsedObjects: unknown[] = [];
  for (const candidate of candidates) {
    const direct = tryJsonParse(candidate);
    if (direct !== null) parsedObjects.push(direct);
    for (const slice of jsonObjectSlices(candidate)) {
      const parsed = tryJsonParse(slice);
      if (parsed !== null) parsedObjects.push(parsed);
    }
  }

  return parsedObjects.find(looksLikeExtractedDocument) ?? parsedObjects.find((value) => value && typeof value === 'object') ?? null;
}

export function parseExtractedDocument(payload: unknown): { ok: true; data: ExtractedDocument } | { ok: false; error: string } {
  let value = payload;
  if (typeof payload === 'string') {
    const extracted = extractJsonValue(payload);
    if (extracted === null) {
      return { ok: false, error: 'Model did not return valid JSON' };
    }
    value = extracted;
  }
  const parsed = ExtractedDocumentSchema.safeParse(value);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((issue) => issue.message).join('; ') };
  }
  return { ok: true, data: parsed.data };
}
