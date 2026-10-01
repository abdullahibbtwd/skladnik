import {
  VAT_PURCHASE_DOCUMENT_TYPES,
  VAT_PURCHASE_FIELDS,
  VAT_SALES_DOCUMENT_TYPES,
  VAT_SALES_FIELDS,
  VAT_TEN_DIGIT_TYPES,
  shiftVatPeriod,
  vatPeriodOf,
  vatPeriodRange,
  type ComplianceIssue,
  type VatCredit,
  type VatEntryRecord,
  type VatLedgerRow,
  type VatReturnInputs,
  type VatSalesGrouping,
  type VatSettingsRecord,
} from '@skladnik/shared';
import { FieldOverflowError, isShortened } from '../compliance/fixed-width';
import { isValidBgVatNumber, ledgerTaxId, normaliseTaxId } from '@skladnik/shared';
import { round2, splitGross } from '../reports/report-math';
import { POKUPKI_FIELDS, PRODAGBI_FIELDS, nraFiles, salesTotals, type DeklarHeader } from './nra-format';

export type PurchaseDocInput = {
  id: string;
  type: 'INVOICE' | 'CREDIT_NOTE';
  direction: 'IN' | 'OUT';
  number: string | null;
  issuedOn: string;
  siteName: string | null;
  partnerName: string | null;
  partnerTaxId: string | null;
  /** Net line amounts (before VAT) with their rate. */
  lines: { net: number; rate: number }[];
  vatCredit: VatCredit | null;
  vatPeriod: string | null;
};

/** One till sale line (voids negative), already on its business date. */
export type TillSaleInput = { siteId: string; siteName: string; siteNumber: number; date: string; rate: number; gross: number };

export type VatPeriodInput = {
  period: string;
  today: string;
  settings: VatSettingsRecord;
  documents: PurchaseDocInput[];
  till: TillSaleInput[];
  entries: VatEntryRecord[];
  inputs: VatReturnInputs;
};

const PURCHASE_KEYS: readonly string[] = VAT_PURCHASE_FIELDS;
const SALES_KEYS: readonly string[] = VAT_SALES_FIELDS;
const RETAIL_PARTNER = 'Физически лица';
const RETAIL_DESCRIPTION = 'Продажби на дребно';
const GOODS_DESCRIPTION = 'Стоки';

const issue = (severity: ComplianceIssue['severity'], code: string, params?: ComplianceIssue['params'], ref?: ComplianceIssue['ref']): ComplianceIssue => ({
  severity,
  code,
  ...(params ? { params } : {}),
  ...(ref ? { ref } : {}),
});

export function documentLabel(number: string | null, partner: string | null) {
  return `№ ${number || '—'}${partner ? ` (${partner})` : ''}`;
}

/** Drop zero amounts and round, so rows compare and hash the same however they were built. */
function cleanAmounts(amounts: Record<string, number>, keys: readonly string[]) {
  const out: Record<string, number> = {};
  for (const key of keys) {
    const value = round2(amounts[key] ?? 0);
    if (value !== 0) out[key] = value;
  }
  return out;
}

function hasMixedSigns(amounts: Record<string, number>) {
  const values = Object.values(amounts).filter((value) => value !== 0);
  return values.some((value) => value > 0) && values.some((value) => value < 0);
}

/** Number as written in the ledger: invoices and notes are 10 digits, leading zeros restored. */
export function ledgerNumber(raw: string | null, documentType: string): { value: string; code?: string; padded?: boolean } {
  const value = (raw ?? '').trim();
  if (!value) return { value, code: 'DOC_NUMBER_MISSING' };
  if (!VAT_TEN_DIGIT_TYPES.includes(documentType)) return value.length > 20 ? { value, code: 'DOC_NUMBER_LONG' } : { value };
  if (/^\d{10}$/.test(value)) return { value };
  const digits = value.replace(/^0+/, '');
  if (/^\d+$/.test(value) && digits.length > 0 && digits.length <= 10) return { value: digits.padStart(10, '0'), padded: true };
  return { value, code: 'DOC_NUMBER_FORMAT' };
}

function textChecks(row: VatLedgerRow, prefix: '02' | '03', label: string, ref: ComplianceIssue['ref']) {
  const fields = prefix === '02' ? PRODAGBI_FIELDS : POKUPKI_FIELDS;
  const nameField = fields.find((field) => field.code === `${prefix}-${prefix === '02' ? '08' : '09'}`)!;
  const whatField = fields.find((field) => field.code === `${prefix}-${prefix === '02' ? '09' : '10'}`)!;
  const out: ComplianceIssue[] = [];
  if (isShortened(nameField, row.partnerName)) out.push(issue('info', 'TEXT_SHORTENED', { document: label, field: nameField.code, width: nameField.width }, ref));
  if (isShortened(whatField, row.description)) out.push(issue('info', 'TEXT_SHORTENED', { document: label, field: whatField.code, width: whatField.width }, ref));
  return out;
}

function periodChecks(period: string, issuedOn: string, withCredit: boolean, label: string, ref: ComplianceIssue['ref']) {
  const natural = vatPeriodOf(issuedOn);
  if (period < natural) return [issue('error', 'PERIOD_BEFORE_DOCUMENT', { document: label, date: issuedOn }, ref)];
  if (withCredit && period > shiftVatPeriod(natural, 12)) return [issue('error', 'CREDIT_EXPIRED', { document: label, date: issuedOn }, ref)];
  return [];
}

// ─── Purchases from posted documents ───────────────────────────────────────

export function purchaseRow(doc: PurchaseDocInput, period: string) {
  const sign = doc.direction === 'OUT' ? -1 : 1;
  const documentType = doc.type === 'INVOICE' ? '01' : sign > 0 ? '02' : '03';
  const byRate = new Map<number, number>();
  for (const line of doc.lines) byRate.set(line.rate, (byRate.get(line.rate) ?? 0) + line.net);
  let taxed = 0;
  let vat = 0;
  let untaxed = 0;
  for (const [rate, net] of byRate) {
    const base = round2(net);
    if (rate > 0) {
      taxed += base;
      vat += round2((base * rate) / 100);
    } else untaxed += base;
  }
  [taxed, vat, untaxed] = [round2(taxed * sign), round2(vat * sign), round2(untaxed * sign)];
  const chargedVat = vat !== 0;
  const credit: VatCredit = doc.vatCredit ?? (chargedVat ? 'FULL' : 'EXCLUDED');
  const withCredit = credit === 'FULL' || credit === 'PARTIAL';
  const amounts: Record<string, number> =
    credit === 'FULL'
      ? { '31': taxed, '41': vat, '30': untaxed }
      : credit === 'PARTIAL'
        ? { '32': taxed, '42': vat, '30': untaxed }
        : { '30': taxed + vat + untaxed };

  const number = ledgerNumber(doc.number, documentType);
  const taxId = ledgerTaxId(doc.partnerTaxId, chargedVat);
  const label = documentLabel(number.value || doc.number, doc.partnerName);
  const ref = { kind: 'document' as const, id: doc.id, documentType: doc.type };
  const row: VatLedgerRow = {
    key: `doc:${doc.id}`,
    source: 'document',
    sourceId: doc.id,
    appDocumentType: doc.type,
    siteName: doc.siteName,
    documentType,
    number: number.value,
    date: doc.issuedOn,
    partnerTaxId: taxId.value,
    partnerName: doc.partnerName,
    description: GOODS_DESCRIPTION,
    amounts: cleanAmounts(amounts, PURCHASE_KEYS),
    credit,
    creditOverride: doc.vatCredit !== null,
    periodOverride: doc.vatPeriod,
  };
  if (credit === 'EXCLUDED') return { row, issues: [] as ComplianceIssue[] };

  const issues: ComplianceIssue[] = [];
  if (number.code) issues.push(issue('error', number.code, { document: label }, ref));
  if (number.padded) issues.push(issue('info', 'DOC_NUMBER_PADDED', { document: documentLabel(doc.number, doc.partnerName), padded: number.value }, ref));
  if (withCredit && !doc.partnerName && !taxId.value) issues.push(issue('error', 'PARTNER_MISSING', { document: label }, ref));
  else if (withCredit && !taxId.value) issues.push(issue('error', 'PARTNER_TAX_ID_MISSING', { document: label, partner: doc.partnerName ?? '' }, ref));
  if (taxId.value && !taxId.valid) issues.push(issue('error', 'PARTNER_TAX_ID_INVALID', { document: label, value: taxId.value }, ref));
  if (taxId.value && taxId.valid && taxId.assumedBg) issues.push(issue('info', 'TAX_ID_ASSUMED_BG', { partner: doc.partnerName ?? label, value: taxId.value }, ref));
  if (taxId.value && !doc.partnerName) issues.push(issue('error', 'PARTNER_NAME_MISSING', { document: label }, ref));
  for (const rate of byRate.keys()) {
    if (![0, 9, 20].includes(rate)) issues.push(issue('warning', 'RATE_UNSUPPORTED', { document: label, rate }, ref));
  }
  if (hasMixedSigns(row.amounts)) issues.push(issue('error', 'MIXED_SIGNS', { document: label }, ref));
  if (Object.keys(row.amounts).length === 0) issues.push(issue('warning', 'EMPTY_ROW', { document: label }, ref));
  issues.push(...periodChecks(period, doc.issuedOn, withCredit, label, ref));
  issues.push(...textChecks(row, '03', label, ref));
  return { row, issues };
}

// ─── Sales from the till ────────────────────────────────────────────────────

export function tillSalesRows(facts: TillSaleInput[], period: string, grouping: VatSalesGrouping) {
  const groups = new Map<string, { siteId: string; siteName: string; siteNumber: number; date: string; gross: Map<number, number> }>();
  const periodEnd = vatPeriodRange(period).to;
  for (const fact of facts) {
    const date = grouping === 'DAY' ? fact.date : periodEnd;
    const key = `${fact.siteId}:${date}`;
    let group = groups.get(key);
    if (!group) {
      group = { siteId: fact.siteId, siteName: fact.siteName, siteNumber: fact.siteNumber, date, gross: new Map() };
      groups.set(key, group);
    }
    group.gross.set(fact.rate, (group.gross.get(fact.rate) ?? 0) + fact.gross);
  }

  const rows: VatLedgerRow[] = [];
  const issues: ComplianceIssue[] = [];
  let zeroRated = 0;
  for (const [key, group] of groups) {
    const number = `SALES-${group.date.slice(0, grouping === 'DAY' ? 10 : 7).replace(/-/g, '')}-${String(group.siteNumber).padStart(2, '0')}`;
    const label = `${number} (${group.siteName})`;
    const amounts: Record<string, number> = {};
    const add = (field: string, value: number) => (amounts[field] = round2((amounts[field] ?? 0) + value));
    for (const [rate, grossRaw] of group.gross) {
      const gross = round2(grossRaw);
      if (gross === 0) continue;
      const { net, vat } = splitGross(gross, rate);
      if (rate === 20) {
        add('11', net);
        add('21', vat);
      } else if (rate === 9) {
        add('13', net);
        add('24', vat);
      } else if (rate === 0) {
        add('19', gross);
        zeroRated += gross;
      } else issues.push(issue('error', 'RATE_UNSUPPORTED', { document: label, rate }, { kind: 'period', period }));
    }
    const clean = cleanAmounts(amounts, SALES_KEYS);
    if (Object.keys(clean).length === 0) continue;
    const totals = salesTotals(clean);
    const row: VatLedgerRow = {
      key: `till:${key}`,
      source: 'till',
      sourceId: null,
      appDocumentType: null,
      siteName: group.siteName,
      documentType: '81',
      number,
      date: group.date,
      partnerTaxId: null,
      partnerName: RETAIL_PARTNER,
      description: RETAIL_DESCRIPTION,
      amounts: { ...clean, '10': round2(totals.base), '20': round2(totals.tax) },
      credit: null,
      creditOverride: false,
      periodOverride: null,
    };
    if (hasMixedSigns(clean)) issues.push(issue('error', 'MIXED_SIGNS', { document: label }, { kind: 'period', period }));
    rows.push(row);
  }
  if (round2(zeroRated) !== 0) issues.push(issue('warning', 'ZERO_RATE_SALES', { amount: round2(zeroRated).toFixed(2) }, { kind: 'period', period }));
  return { rows, issues };
}

// ─── Manual entries ─────────────────────────────────────────────────────────

export function entryRow(entry: VatEntryRecord, period: string) {
  const purchases = entry.ledger === 'PURCHASES';
  const keys = purchases ? PURCHASE_KEYS : SALES_KEYS;
  const amounts = cleanAmounts(entry.amounts, keys);
  const number = ledgerNumber(entry.number, entry.documentType);
  const rawTaxId = normaliseTaxId(entry.partnerTaxId);
  const taxId = ledgerTaxId(rawTaxId, false);
  const label = documentLabel(number.value || entry.number, entry.partnerName);
  const ref = { kind: 'entry' as const, id: entry.id };
  const totals = salesTotals(amounts);
  const row: VatLedgerRow = {
    key: `entry:${entry.id}`,
    source: 'entry',
    sourceId: entry.id,
    appDocumentType: null,
    siteName: null,
    documentType: entry.documentType,
    number: number.value,
    date: entry.issuedOn,
    partnerTaxId: taxId.value,
    partnerName: entry.partnerName,
    description: entry.description ?? '',
    amounts: purchases ? amounts : { ...amounts, '10': round2(totals.base), '20': round2(totals.tax) },
    credit: null,
    creditOverride: false,
    periodOverride: null,
  };

  const issues: ComplianceIssue[] = [];
  const allowed: readonly string[] = purchases ? VAT_PURCHASE_DOCUMENT_TYPES : VAT_SALES_DOCUMENT_TYPES;
  if (!allowed.includes(entry.documentType)) issues.push(issue('error', 'DOC_TYPE_INVALID', { document: label, value: entry.documentType }, ref));
  if (number.code) issues.push(issue('error', number.code, { document: label }, ref));
  if (number.padded) issues.push(issue('info', 'DOC_NUMBER_PADDED', { document: documentLabel(entry.number, entry.partnerName), padded: number.value }, ref));
  const withCredit = purchases && ['31', '41', '32', '42'].some((key) => amounts[key]);
  if (withCredit && !taxId.value) issues.push(issue('error', 'PARTNER_TAX_ID_MISSING', { document: label, partner: entry.partnerName ?? '' }, ref));
  if (taxId.value && !taxId.valid) issues.push(issue('error', 'PARTNER_TAX_ID_INVALID', { document: label, value: taxId.value }, ref));
  if (taxId.value && !entry.partnerName) issues.push(issue('error', 'PARTNER_NAME_MISSING', { document: label }, ref));
  if (entry.issuedOn > vatPeriodRange(period).to) issues.push(issue('error', 'DOC_DATE_AFTER_PERIOD', { document: label, date: entry.issuedOn }, ref));
  else issues.push(...periodChecks(period, entry.issuedOn, withCredit, label, ref));
  if (hasMixedSigns(amounts)) issues.push(issue('error', 'MIXED_SIGNS', { document: label }, ref));
  if (Object.keys(amounts).length === 0) issues.push(issue('warning', 'EMPTY_ROW', { document: label }, ref));
  issues.push(...textChecks(row, purchases ? '03' : '02', label, ref));
  return { row, issues };
}

// ─── Return ─────────────────────────────────────────────────────────────────

const byLedgerOrder = (a: VatLedgerRow, b: VatLedgerRow) =>
  a.date.localeCompare(b.date) || a.documentType.localeCompare(b.documentType) || a.number.localeCompare(b.number) || a.key.localeCompare(b.key);

export function returnCells(purchases: VatLedgerRow[], sales: VatLedgerRow[], coefficient: number, inputs: VatReturnInputs) {
  const sum = (rows: VatLedgerRow[], ...keys: string[]) => round2(rows.reduce((total, row) => total + keys.reduce((acc, key) => acc + (row.amounts[key] ?? 0), 0), 0));
  const cells: Record<string, number> = {
    '01': sum(sales, '11', '12', '13', '14', '15', '16', '26'),
    '20': sum(sales, '21', '22', '23', '24'),
    '11': sum(sales, '11'),
    '21': sum(sales, '21'),
    '12': sum(sales, '12', '26'),
    '22': sum(sales, '22'),
    '23': sum(sales, '23'),
    '13': sum(sales, '13'),
    '24': sum(sales, '24'),
    '14': sum(sales, '14'),
    '15': sum(sales, '15'),
    '16': sum(sales, '16'),
    '17': sum(sales, '17'),
    '18': sum(sales, '18', '25'),
    '19': sum(sales, '19'),
    '30': sum(purchases, '30', '44'),
    '31': sum(purchases, '31'),
    '41': sum(purchases, '41'),
    '32': sum(purchases, '32'),
    '42': sum(purchases, '42'),
    '43': sum(purchases, '43'),
    '33': coefficient,
  };
  cells['40'] = round2(cells['41'] + cells['42'] * coefficient + cells['43']);
  const result = round2(cells['20'] - cells['40']);
  cells['50'] = result >= 0 ? result : 0;
  cells['60'] = result < 0 ? -result : 0;
  cells['70'] = round2(inputs.cell70);
  cells['71'] = round2(inputs.cell71);
  cells['80'] = round2(inputs.cell80);
  cells['81'] = round2(inputs.cell81);
  cells['82'] = round2(inputs.cell82);
  return cells;
}

export function returnIssues(cells: Record<string, number>) {
  const ref = { kind: 'return' as const };
  const issues: ComplianceIssue[] = [];
  const coefficient = cells['33'];
  if (!(coefficient >= 0 && coefficient <= 1)) issues.push(issue('error', 'COEFFICIENT_RANGE', undefined, ref));
  else if (cells['42'] !== 0 && coefficient === 0) issues.push(issue('warning', 'COEFFICIENT_MISSING', { amount: cells['42'].toFixed(2) }, ref));
  if (round2(cells['70'] + cells['71']) > cells['50']) issues.push(issue('error', 'RETURN_70_71', { max: cells['50'].toFixed(2) }, ref));
  if (round2(cells['80'] + cells['81'] + cells['82']) > cells['60']) issues.push(issue('error', 'RETURN_80_82', { max: cells['60'].toFixed(2) }, ref));
  return issues;
}

export function settingsIssues(settings: VatSettingsRecord) {
  const ref = { kind: 'settings' as const };
  const issues: ComplianceIssue[] = [];
  if (!settings.vatNumber) issues.push(issue('error', 'SETTINGS_VAT_NUMBER', undefined, ref));
  else if (!isValidBgVatNumber(settings.vatNumber)) issues.push(issue('error', 'SETTINGS_VAT_NUMBER_INVALID', { value: settings.vatNumber }, ref));
  if (!settings.declarant?.trim()) issues.push(issue('error', 'SETTINGS_DECLARANT', undefined, ref));
  return issues;
}

export function deklarHeader(settings: VatSettingsRecord, period: string): DeklarHeader {
  return {
    vatNumber: settings.vatNumber ?? '',
    name: settings.legalName?.trim() || settings.companyName,
    declarant: settings.declarant?.trim() ?? '',
    period,
    branch: settings.branch,
  };
}

/** Everything that ends up in the files; the filing's hash is taken from this. */
export function fileContent(header: DeklarHeader, purchases: VatLedgerRow[], sales: VatLedgerRow[], cells: Record<string, number>) {
  const pick = (row: VatLedgerRow) => [row.documentType, row.number, row.date, row.partnerTaxId, row.partnerName, row.description, row.amounts];
  return { header, purchases: purchases.map(pick), sales: sales.map(pick), cells };
}

export function buildVatPeriod(input: VatPeriodInput) {
  const { period, settings } = input;
  const issues: ComplianceIssue[] = [...settingsIssues(settings)];
  const range = vatPeriodRange(period);
  if (range.from > input.today) issues.push(issue('error', 'PERIOD_FUTURE', undefined, { kind: 'period', period }));
  else if (range.to >= input.today) issues.push(issue('warning', 'PERIOD_OPEN', undefined, { kind: 'period', period }));

  const purchases: VatLedgerRow[] = [];
  const excluded: VatLedgerRow[] = [];
  for (const doc of input.documents) {
    const built = purchaseRow(doc, period);
    (built.row.credit === 'EXCLUDED' ? excluded : purchases).push(built.row);
    issues.push(...built.issues);
  }
  const sales: VatLedgerRow[] = [];
  const till = tillSalesRows(input.till, period, settings.salesGrouping);
  sales.push(...till.rows);
  issues.push(...till.issues);
  for (const entry of input.entries) {
    const built = entryRow(entry, period);
    (entry.ledger === 'PURCHASES' ? purchases : sales).push(built.row);
    issues.push(...built.issues);
  }
  purchases.sort(byLedgerOrder);
  sales.sort(byLedgerOrder);
  excluded.sort(byLedgerOrder);

  const seen = new Set<string>();
  for (const row of purchases) {
    const key = `${row.partnerTaxId ?? row.partnerName ?? ''}|${row.documentType}|${row.number}`;
    if (seen.has(key)) {
      const ref = row.source === 'entry' ? { kind: 'entry' as const, id: row.sourceId! } : { kind: 'document' as const, id: row.sourceId!, documentType: row.appDocumentType ?? undefined };
      issues.push(issue('error', 'DUPLICATE_DOCUMENT', { document: documentLabel(row.number, row.partnerName) }, ref));
    }
    seen.add(key);
  }
  const zeroVat = excluded.filter((row) => !row.creditOverride).length;
  if (zeroVat > 0) issues.push(issue('warning', 'ZERO_VAT_EXCLUDED', { count: zeroVat }, { kind: 'period', period }));

  const coefficient = input.inputs.coefficient ?? settings.coefficient;
  const cells = returnCells(purchases, sales, coefficient, input.inputs);
  issues.push(...returnIssues(cells));

  const header = deklarHeader(settings, period);
  try {
    nraFiles(header, purchases, sales, cells);
  } catch (error) {
    if (!(error instanceof FieldOverflowError)) throw error;
    issues.push(issue('error', 'AMOUNT_TOO_LONG', { field: error.code }, { kind: 'return' }));
  }
  return { purchases, sales, excluded, cells, issues, header };
}
