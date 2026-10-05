import { parseOcrDate } from './parse-ocr-date';
import type { ExtractedDocument, ExtractedLine } from './extracted-document.schema';

/** Strip HTML tags and decode a few entities OCR tables usually emit. */
export function cellText(raw: string): string {
  return raw
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/√+|✓+|✔+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseEuropeanNumber(raw: string | null | undefined): number | null {
  if (!raw?.trim()) return null;
  // "6.000бр." / "1.938кг" — keep the leading number, drop the unit suffix.
  const unitSuffix = raw.trim().match(/^([+-]?\d+[.,]?\d*)\s*[a-zA-Zа-яА-Я%].*$/u);
  let text = (unitSuffix?.[1] ?? raw.trim()).replace(/[^\d,.\-]/g, '');
  if (!text || text === '-' || text === '.' || text === ',') return null;
  // 1.234,56 or 14,58 → prefer comma as decimal when both separators appear, else comma-decimal.
  if (text.includes(',') && text.includes('.')) {
    text = text.replace(/\./g, '').replace(',', '.');
  } else if (text.includes(',')) {
    text = text.replace(',', '.');
  }
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

function isoDate(raw: string | null | undefined): string | null {
  const date = parseOcrDate(raw);
  return date ? date.toISOString().slice(0, 10) : null;
}

type ColumnKey =
  | 'printedLineNumber'
  | 'supplierCode'
  | 'ocrDescription'
  | 'ocrExpiryDate'
  | 'ocrBatchNumber'
  | 'ocrUnit'
  | 'qty'
  | 'unitPrice'
  | 'finalUnitPrice'
  | 'discountPercent'
  | 'vatRate'
  | 'lineTotal'
  | 'ignore';

const HEADER_ALIASES: [ColumnKey, RegExp][] = [
  ['printedLineNumber', /^(№|no|nо|номер)$/i],
  ['supplierCode', /^(код|code|арт)/i],
  ['ocrDescription', /(стока|наимен|описан|артикул|страна|goods|опис)/i],
  ['ocrExpiryDate', /(годно|годен|срок|expir)/i],
  ['ocrBatchNumber', /(партид|парт\.?|batch|lot)/i],
  ['ocrUnit', /(мярка|единиц|ед\.|вид|unit)/i],
  ['qty', /(кол|количество|qty|конт)/i],
  ['finalUnitPrice', /(пр\.?\s*цен|кр\.?\s*цен|promo|final)/i],
  ['unitPrice', /^(цена|price|ед\.?\s*цен)/i],
  ['discountPercent', /(то\s*%|отст|disc)/i],
  ['vatRate', /(%|ддс|vat|много|к\.?\s*дс)/i],
  ['lineTotal', /(стойност|стоимость|сума|total|amount)/i],
];

/** Classic Bulgarian стокова разписка line table (11 columns). */
const STOCK_RECEIPT_11: ColumnKey[] = [
  'printedLineNumber',
  'supplierCode',
  'ocrDescription',
  'ocrExpiryDate',
  'ocrBatchNumber',
  'ocrUnit',
  'qty',
  'unitPrice',
  'finalUnitPrice',
  'vatRate',
  'lineTotal',
];

/** Търговски документ / invoice table without line № + code columns (8 cols). */
const COMMERCIAL_8: ColumnKey[] = [
  'ocrDescription',
  'ocrUnit',
  'ocrBatchNumber',
  'qty',
  'unitPrice',
  'discountPercent',
  'finalUnitPrice',
  'lineTotal',
];

/** Same layout when OCR drops the unit/type column (7 cols). */
const COMMERCIAL_7: ColumnKey[] = [
  'ocrDescription',
  'ocrBatchNumber',
  'qty',
  'unitPrice',
  'discountPercent',
  'finalUnitPrice',
  'lineTotal',
];

/** Warehouse dispatch with characteristics packed in the last column. */
const DISPATCH_9: ColumnKey[] = [
  'printedLineNumber',
  'ocrDescription',
  'ocrUnit',
  'qty',
  'ignore',
  'vatRate',
  'finalUnitPrice',
  'lineTotal',
  'ocrBatchNumber',
];

function positionalColumns(width: number): ColumnKey[] | null {
  if (width === 11 || width === 12) return STOCK_RECEIPT_11.slice(0, width);
  if (width === 10) return STOCK_RECEIPT_11.slice(0, 10);
  if (width === 9) return DISPATCH_9;
  if (width === 8) return COMMERCIAL_8;
  if (width === 7) return COMMERCIAL_7;
  return null;
}

function mapHeaders(headers: string[]): ColumnKey[] | null {
  const mapped: ColumnKey[] = [];
  const used = new Set<ColumnKey>();
  for (const header of headers) {
    const text = cellText(header);
    let key: ColumnKey = 'ignore';
    for (const [candidate, pattern] of HEADER_ALIASES) {
      if (!pattern.test(text) || used.has(candidate)) continue;
      key = candidate;
      break;
    }
    // Second bare № / No on BG stock receipts is the article code column.
    if (key === 'ignore' && /^(№|no|nо)$/i.test(text) && used.has('printedLineNumber')) {
      key = 'supplierCode';
    }
    if (key !== 'ignore') used.add(key);
    mapped.push(key);
  }
  const useful = mapped.filter((key) => key !== 'ignore').length;
  if (useful >= 4) return mapped;
  return positionalColumns(headers.length);
}

function looksLikeHeaderRow(cells: string[]): boolean {
  const joined = cells.join(' ').toLowerCase();
  const labelHits = /(стока|опис|наимен|партид|количество|цена|стойност|мярка|годно|код|сума)/i.test(joined);
  const hasProductCode = cells.some((cell) => /^\d{3,}-/.test(cell) || /^\d{4,}\s/.test(cell));
  return labelHits && !hasProductCode;
}

function looksLikeLineRow(cells: string[]): boolean {
  if (cells.length < 4) return false;
  const joined = cells.join(' ');
  if (/^(общо|total|сума за|данъч)/i.test(cells[0] ?? '')) return false;
  const hasText = cells.some((cell) => /[A-Za-zА-Яа-я]{3,}/u.test(cell));
  const numberCells = cells.filter((cell) => parseEuropeanNumber(cell) != null).length;
  return hasText && numberCells >= 2;
}

function extractTables(markdown: string): { headers: string[]; rows: string[][] }[] {
  const tables: { headers: string[]; rows: string[][] }[] = [];
  const tableRe = /<table\b[^>]*>([\s\S]*?)<\/table>/gi;
  let match: RegExpExecArray | null;
  while ((match = tableRe.exec(markdown))) {
    const html = match[1];
    const rowsHtml = [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((row) => row[1]);
    if (!rowsHtml.length) continue;
    const parsedRows = rowsHtml.map((row) =>
      [...row.matchAll(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((cell) => cellText(cell[1])),
    );
    if (!parsedRows[0]?.length) continue;
    // Skip 2-column party / address mini-tables.
    if (parsedRows[0].length <= 3 && parsedRows.every((row) => row.length <= 3)) continue;

    const hasThead = /<th\b/i.test(rowsHtml[0]) || /<thead\b/i.test(html);
    if (hasThead) {
      tables.push({ headers: parsedRows[0], rows: parsedRows.slice(1) });
      continue;
    }
    if (looksLikeHeaderRow(parsedRows[0])) {
      tables.push({ headers: parsedRows[0], rows: parsedRows.slice(1) });
      continue;
    }
    // Data-only fragment (GLM-OCR often splits one invoice into many small tables).
    tables.push({
      headers: Array.from({ length: parsedRows[0].length }, (_, i) => String(i)),
      rows: parsedRows,
    });
  }
  return tables;
}

/** Pull a leading supplier article code out of "58013-БОЖУРКА …". */
function splitLeadingCode(description: string): { code: string | null; name: string } {
  const match = description.match(/^(\d{3,}[\p{L}\d]*)\s*[-–:.\s]+\s*(.+)$/u);
  if (!match) return { code: null, name: description };
  return { code: match[1], name: match[2].trim() || description };
}

function rowToLine(cells: string[], columns: ColumnKey[]): ExtractedLine | null {
  const pick = (key: ColumnKey) => {
    const index = columns.indexOf(key);
    return index >= 0 ? cells[index] ?? '' : '';
  };

  let description = pick('ocrDescription').trim();
  const qty = parseEuropeanNumber(pick('qty'));
  if (!description && qty == null) return null;
  if (/^(общо|total|сума)/i.test(description)) return null;
  if (!looksLikeLineRow(cells) && !description) return null;

  let code = pick('supplierCode').trim() || null;
  if (!code && description) {
    const split = splitLeadingCode(description);
    code = split.code;
    description = split.name;
  }

  // Batch column sometimes holds "L26312521 / 08.01.27" — split expiry out.
  let batch = pick('ocrBatchNumber').trim() || null;
  let expiry = isoDate(pick('ocrExpiryDate'));
  if (batch && !expiry) {
    const mixed = batch.match(/^(.+?)\s*\/\s*(\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\S*)/);
    if (mixed) {
      batch = mixed[1].trim();
      expiry = isoDate(mixed[2]);
    } else if (/^\d{8}$/.test(batch)) {
      // Compact date used as lot on some commercial docs: DDMMYYYY or YYYYMMDD.
      const dmy = batch.match(/^(\d{2})(\d{2})(\d{4})$/);
      const ymd = batch.match(/^(\d{4})(\d{2})(\d{2})$/);
      if (dmy) expiry = isoDate(`${dmy[1]}.${dmy[2]}.${dmy[3]}`);
      else if (ymd) expiry = isoDate(`${ymd[1]}-${ymd[2]}-${ymd[3]}`);
    }
  }

  const unitPrice = parseEuropeanNumber(pick('unitPrice'));
  const finalUnitPrice = parseEuropeanNumber(pick('finalUnitPrice'));
  const lineTotal = parseEuropeanNumber(pick('lineTotal'));
  const vatRate = parseEuropeanNumber(pick('vatRate'));
  const discountPercent = parseEuropeanNumber(pick('discountPercent'));
  const printed = parseEuropeanNumber(pick('printedLineNumber'));
  const unit = pick('ocrUnit').trim() || null;

  // Qty cell sometimes embeds the unit ("6.000бр") — keep a short unit hint when missing.
  let ocrUnit = unit;
  if (!ocrUnit) {
    const qtyRaw = pick('qty');
    const unitFromQty = qtyRaw.match(/\d\s*([a-zA-Zа-яА-Я.]{1,6})\s*$/u)?.[1];
    if (unitFromQty && !/^\d/.test(unitFromQty)) ocrUnit = unitFromQty;
  }

  return {
    printedLineNumber: printed,
    supplierCode: code && code !== '—' && code !== '-' ? code : null,
    barcode: null,
    ocrDescription: description || code || '?',
    ocrUnit,
    qty: qty ?? 0,
    unitPrice,
    discountPercent: discountPercent != null && discountPercent !== 0 ? Math.abs(discountPercent) : null,
    finalUnitPrice: finalUnitPrice ?? unitPrice,
    lineTotal,
    vatRate,
    ocrBatchNumber: batch && batch !== '—' ? batch : null,
    ocrExpiryDate: expiry,
  };
}

/**
 * Pull line items from GLM-OCR Markdown.
 * Merges fragmented HTML tables (common on commercial invoices) and accepts header-less tables.
 */
export function linesFromLayoutMarkdown(markdown: string): ExtractedLine[] {
  const tables = extractTables(markdown);
  if (!tables.length) return [];

  // Group by column width so header fragments and data fragments can combine.
  const byWidth = new Map<number, { headers: string[] | null; rows: string[][] }>();
  for (const table of tables) {
    const width = Math.max(table.headers.length, ...table.rows.map((row) => row.length), 0);
    if (width < 6) continue;
    const bucket = byWidth.get(width) ?? { headers: null, rows: [] };
    const headerIsReal = table.headers.some((cell) => /[A-Za-zА-Яа-я]/u.test(cell) && !/^\d+$/.test(cell));
    if (headerIsReal && looksLikeHeaderRow(table.headers)) bucket.headers = table.headers;
    for (const row of table.rows) {
      if (row.length >= width - 1) bucket.rows.push(row.length === width ? row : row.concat(Array(width - row.length).fill('')));
    }
    byWidth.set(width, bucket);
  }

  let best: ExtractedLine[] = [];
  for (const [width, bucket] of byWidth) {
    if (!bucket.rows.length) continue;
    const columns =
      (bucket.headers ? mapHeaders(bucket.headers) : null) ??
      positionalColumns(width);
    if (!columns) continue;
    const lines = bucket.rows
      .filter((row) => looksLikeLineRow(row))
      .map((row) => rowToLine(row, columns))
      .filter((line): line is ExtractedLine => Boolean(line));
    // Keep every width that produced rows — OCR often mixes 7- and 8-col fragments.
    if (lines.length) best = best.concat(lines);
  }

  // Prefer the largest coherent block if we somehow duplicated the same rows.
  const seen = new Set<string>();
  return best.filter((line) => {
    const key = `${line.ocrDescription}|${line.qty}|${line.lineTotal ?? ''}|${line.ocrBatchNumber ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Markdown without large line-item tables — for a small/fast header LLM call. */
export function headerMarkdown(markdown: string): string {
  return markdown
    .replace(/<table\b[^>]*>[\s\S]*?<\/table>/gi, (table) => {
      // Keep tiny party tables (2 cols); drop wide line tables.
      const cols = (table.match(/<t[hd]\b/gi) ?? []).length;
      const rows = (table.match(/<tr\b/gi) ?? []).length;
      return cols > 8 || rows > 4 ? '\n[LINE TABLE OMITTED]\n' : table;
    })
    .trim();
}

const TAX_ID = /(?:ЕИК|Идент(?:и)?\.?\s*Ne?|Иденти\.?\s*Ne?|ДДС\s*№?|VAT)\s*[:.]?\s*([A-Z]{0,2}\d{9,13})/gi;
const DOC_NO = /(?:№|N[ºo°]|Номер|Ne)\s*[:.]?\s*([0-9]{6,})/i;
const DOC_DATE = /(?:Дата(?:\s+на\s+издаване)?|\/)\s*[:.]?\s*(\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\S*)/i;

/**
 * Best-effort header from OCR text (no LLM). Fills what it can; missing fields stay null.
 */
export function headerFromLayoutMarkdown(markdown: string): Partial<ExtractedDocument> {
  // Keep line breaks so field regexes stop at the end of each printed line.
  const text = markdown
    .replace(/<table\b[^>]*>[\s\S]*?<\/table>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  const taxIds = [...text.matchAll(TAX_ID)].map((match) => match[1]);
  const supplierBlock = text.match(/(?:Доставчик|Достевник)\s*[:.]?\s*([^\n]+)/i)?.[1]?.trim() ?? null;
  const clientBlock = text.match(/(?:Получател|Потурчен|Клиент)\s*[:.]?\s*([^\n]+)/i)?.[1]?.trim() ?? null;

  // Party mini-tables often put client name in the first 2-col table.
  const partyTables = extractTables(markdown).filter((table) => table.headers.length <= 3 && table.rows.length <= 8);
  let clientName: string | null = null;
  let clientTaxId: string | null = null;
  for (const table of partyTables) {
    for (const row of [table.headers, ...table.rows]) {
      if (row.length < 2) continue;
      const label = row[0].toLowerCase();
      const value = row[1];
      if (/получ|клиент|потурч|наент/.test(label) || /врана|мега|еоод|оод/i.test(value)) {
        if (!clientName && /[А-Яа-яA-Za-z]{3,}/.test(value) && !/^\d+$/.test(value)) clientName = value;
      }
      if (/еИК|наент|идент|ддс/i.test(label) && /\d{9,}/.test(value)) clientTaxId = value.replace(/\D/g, '').slice(-9) || value;
    }
  }

  const docNo = text.match(DOC_NO)?.[1] ?? null;
  const issuedOn = isoDate(text.match(DOC_DATE)?.[1]) ?? isoDate(text.match(/(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})/)?.[1]);
  const isReceipt = /стоков/i.test(text);

  return {
    documentNumber: docNo,
    issuedOn,
    documentType: isReceipt ? 'RECEIPT' : 'INVOICE',
    supplier: {
      name: supplierBlock,
      taxId: taxIds[1] ?? taxIds[0] ?? null,
      address: null,
      mol: text.match(/МОЛ\s*[:.]?\s*([^\n]+)/i)?.[1]?.trim() ?? null,
      phone: text.match(/Телефон\s*[:.]?\s*([+\d\s/-]{6,})/i)?.[1]?.trim() ?? null,
    },
    client: {
      name: clientName ?? clientBlock,
      taxId: clientTaxId ?? taxIds[0] ?? null,
      address: null,
    },
    deliveryAddress: null,
    taxableBase: null,
    vatAmount: null,
    grossTotal: null,
    amountInWords: null,
    paymentMethod: null,
    confidence: 'medium',
    fieldConfidence: {
      documentNumber: docNo ? 'medium' : 'low',
      issuedOn: issuedOn ? 'medium' : 'low',
      supplierName: supplierBlock ? 'medium' : 'low',
      supplierTaxId: taxIds.length ? 'medium' : 'low',
      grossTotal: 'low',
    },
  };
}

export function mergeLayoutExtraction(header: Partial<ExtractedDocument>, lines: ExtractedLine[]): ExtractedDocument {
  return {
    documentNumber: header.documentNumber ?? null,
    issuedOn: header.issuedOn ?? null,
    documentType: header.documentType ?? 'RECEIPT',
    supplier: {
      name: header.supplier?.name ?? null,
      taxId: header.supplier?.taxId ?? null,
      address: header.supplier?.address ?? null,
      mol: header.supplier?.mol ?? null,
      phone: header.supplier?.phone ?? null,
    },
    client: {
      name: header.client?.name ?? null,
      taxId: header.client?.taxId ?? null,
      address: header.client?.address ?? null,
    },
    deliveryAddress: header.deliveryAddress ?? null,
    lines,
    taxableBase: header.taxableBase ?? null,
    vatAmount: header.vatAmount ?? null,
    grossTotal: header.grossTotal ?? null,
    amountInWords: header.amountInWords ?? null,
    paymentMethod: header.paymentMethod ?? null,
    confidence: header.confidence ?? (lines.length ? 'medium' : 'low'),
    fieldConfidence: header.fieldConfidence ?? {
      documentNumber: 'low',
      issuedOn: 'low',
      supplierName: 'low',
      supplierTaxId: 'low',
      grossTotal: 'low',
    },
  };
}
