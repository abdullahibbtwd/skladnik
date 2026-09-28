import type { VatEntryRecord, VatReturnInputs, VatSettingsRecord } from '@skladnik/shared';
import { DEKLAR_FIELDS, POKUPKI_FIELDS, PRODAGBI_FIELDS, nraDate, nraFiles } from './nra-format';
import { recordWidth } from '../compliance/fixed-width';
import { buildVatPeriod, ledgerNumber, purchaseRow, returnCells, returnIssues, tillSalesRows, type PurchaseDocInput } from './vat-ledger';

function expectEqual(actual: unknown, expected: unknown, label: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${label}: expected ${e}, got ${a}`);
}

const codes = (issues: { code: string; severity: string }[], severity?: string) =>
  issues.filter((issue) => !severity || issue.severity === severity).map((issue) => issue.code).sort();

// Numbers
expectEqual(ledgerNumber('1234', '01'), { value: '0000001234', padded: true }, 'invoice number padded to 10 digits');
expectEqual(ledgerNumber('0000001234', '01'), { value: '0000001234' }, '10 digits kept');
expectEqual(ledgerNumber('00000001234', '01'), { value: '0000001234', padded: true }, 'extra leading zeros dropped');
expectEqual(ledgerNumber('SCAN-1', '01').code, 'DOC_NUMBER_FORMAT', 'letters in an invoice number');
expectEqual(ledgerNumber('12345678901', '03').code, 'DOC_NUMBER_FORMAT', 'more than 10 digits');
expectEqual(ledgerNumber('07/2026/123', '09'), { value: '07/2026/123' }, 'protocols keep their number');
expectEqual(ledgerNumber('', '09').code, 'DOC_NUMBER_MISSING', 'missing number');
expectEqual(ledgerNumber('x'.repeat(21), '09').code, 'DOC_NUMBER_LONG', 'too long');
expectEqual(nraDate('2026-08-03'), '03/08/2026', 'date format');

const settings: VatSettingsRecord = {
  vatNumber: 'BG123456786',
  legalName: 'Метро Корнер ЕООД',
  declarant: 'Иван Петров',
  branch: 0,
  salesGrouping: 'MONTH',
  coefficient: 0,
  companyName: 'Metro Corner Market',
};
const inputs: VatReturnInputs = { coefficient: 0.5, cell70: 0, cell71: 0, cell80: 0, cell81: 0, cell82: 0 };
const supplier = { partnerName: 'Доставчик ООД', partnerTaxId: '123456786', siteName: 'Main Store', vatCredit: null, vatPeriod: null };
const doc = (id: string, patch: Partial<PurchaseDocInput>): PurchaseDocInput => ({
  id,
  type: 'INVOICE',
  direction: 'IN',
  number: '0000000001',
  issuedOn: '2026-08-10',
  lines: [],
  ...supplier,
  ...patch,
});

// Purchase rows
const invoice = purchaseRow(doc('inv', { number: '1234', lines: [{ net: 100, rate: 20 }, { net: 50, rate: 9 }, { net: 10, rate: 0 }] }), '2026-08');
expectEqual(invoice.row.documentType, '01', 'invoice code');
expectEqual(invoice.row.number, '0000001234', 'padded number in the row');
expectEqual(invoice.row.partnerTaxId, 'BG123456786', 'supplier VAT number');
expectEqual(invoice.row.amounts, { '30': 10, '31': 150, '41': 24.5 }, 'full credit: taxed base, VAT, untaxed base');
expectEqual(codes(invoice.issues), ['DOC_NUMBER_PADDED', 'TAX_ID_ASSUMED_BG'], 'only info notes');

const credit = purchaseRow(doc('cn', { type: 'CREDIT_NOTE', direction: 'OUT', number: '0000000077', lines: [{ net: 20, rate: 20 }] }), '2026-08');
expectEqual([credit.row.documentType, credit.row.amounts], ['03', { '31': -20, '41': -4 }], 'credit note is negative, code 03');
const debit = purchaseRow(doc('dn', { type: 'CREDIT_NOTE', direction: 'IN', lines: [{ net: 5, rate: 20 }] }), '2026-08');
expectEqual(debit.row.documentType, '02', 'note increasing the amount is a debit note');

const partial = purchaseRow(doc('p', { number: '0000000002', vatCredit: 'PARTIAL', lines: [{ net: 200, rate: 20 }] }), '2026-08');
expectEqual([partial.row.credit, partial.row.creditOverride, partial.row.amounts], ['PARTIAL', true, { '32': 200, '42': 40 }], 'partial credit');
const none = purchaseRow(doc('n', { vatCredit: 'NONE', lines: [{ net: 200, rate: 20 }, { net: 10, rate: 0 }] }), '2026-08');
expectEqual(none.row.amounts, { '30': 250 }, 'no credit: base, VAT and untaxed together');
const zero = purchaseRow(doc('z', { lines: [{ net: 30, rate: 0 }] }), '2026-08');
expectEqual([zero.row.credit, zero.row.partnerTaxId, zero.issues.length], ['EXCLUDED', '123456786', 0], 'no VAT: left out, ЕИК kept');

const scan = purchaseRow(doc('s', { number: 'SCAN-1', partnerTaxId: null, lines: [{ net: 10, rate: 20 }] }), '2026-08');
expectEqual(codes(scan.issues, 'error'), ['DOC_NUMBER_FORMAT', 'PARTNER_TAX_ID_MISSING'], 'scan number and no VAT number block');
const badId = purchaseRow(doc('b', { partnerTaxId: '123456787', lines: [{ net: 10, rate: 20 }] }), '2026-08');
expectEqual(codes(badId.issues, 'error'), ['PARTNER_TAX_ID_INVALID'], 'invalid VAT number blocks');
const expired = purchaseRow(doc('e', { issuedOn: '2025-07-31', lines: [{ net: 10, rate: 20 }] }), '2026-08');
expectEqual(codes(expired.issues, 'error'), ['CREDIT_EXPIRED'], 'credit only within 12 months');
const inTime = purchaseRow(doc('t', { issuedOn: '2025-08-01', lines: [{ net: 10, rate: 20 }] }), '2026-08');
expectEqual(codes(inTime.issues, 'error'), [], '12th following period is allowed');
const early = purchaseRow(doc('x', { issuedOn: '2026-09-01', lines: [{ net: 10, rate: 20 }] }), '2026-08');
expectEqual(codes(early.issues, 'error'), ['PERIOD_BEFORE_DOCUMENT'], 'cannot declare before the document');
const mixed = purchaseRow(doc('m', { lines: [{ net: 100, rate: 20 }, { net: -30, rate: 0 }] }), '2026-08');
expectEqual(codes(mixed.issues, 'error'), ['MIXED_SIGNS'], 'one sign per record');
const oddRate = purchaseRow(doc('r', { lines: [{ net: 100, rate: 18 }] }), '2026-08');
expectEqual([oddRate.row.amounts, codes(oddRate.issues, 'warning')], [{ '31': 100, '41': 18 }, ['RATE_UNSUPPORTED']], 'unusual purchase rate is a warning');

// Till sales
const site = { siteId: 's1', siteName: 'Main Store', siteNumber: 1 };
const till = [
  { ...site, date: '2026-08-03', rate: 20, gross: 120 },
  { ...site, date: '2026-08-03', rate: 20, gross: -12 },
  { ...site, date: '2026-08-20', rate: 9, gross: 109 },
  { ...site, date: '2026-08-20', rate: 0, gross: 5 },
  { siteId: 's2', siteName: 'Warehouse', siteNumber: 2, date: '2026-08-05', rate: 20, gross: 24 },
];
const monthly = tillSalesRows(till, '2026-08', 'MONTH');
expectEqual(
  monthly.rows.map((row) => [row.documentType, row.number, row.date, row.amounts]),
  [
    ['81', 'SALES-202608-01', '2026-08-31', { '11': 90, '21': 18, '13': 100, '24': 9, '19': 5, '10': 190, '20': 27 }],
    ['81', 'SALES-202608-02', '2026-08-31', { '11': 20, '21': 4, '10': 20, '20': 4 }],
  ],
  'one sales report per site and month, voids netted',
);
expectEqual(codes(monthly.issues), ['ZERO_RATE_SALES'], '0% sales flagged');
const daily = tillSalesRows(till, '2026-08', 'DAY');
expectEqual(daily.rows.map((row) => row.number), ['SALES-20260803-01', 'SALES-20260820-01', 'SALES-20260805-02'], 'daily reports');
expectEqual(codes(tillSalesRows([{ ...site, date: '2026-08-03', rate: 5, gross: 10 }], '2026-08', 'MONTH').issues, 'error'), ['RATE_UNSUPPORTED'], 'sales rate without a cell');

// Whole period
const entries: VatEntryRecord[] = [
  { id: 'e1', ledger: 'SALES', period: '2026-08', documentType: '01', number: '0000000010', issuedOn: '2026-08-15', partnerTaxId: 'BG123456786', partnerName: 'Клиент АД', description: 'Стоки', amounts: { '11': 1000, '21': 200 } },
];
const view = buildVatPeriod({
  period: '2026-08',
  today: '2026-09-28',
  settings,
  documents: [
    doc('inv', { number: '1234', lines: [{ net: 100, rate: 20 }, { net: 50, rate: 9 }, { net: 10, rate: 0 }] }),
    doc('cn', { type: 'CREDIT_NOTE', direction: 'OUT', number: '0000000077', issuedOn: '2026-08-12', lines: [{ net: 20, rate: 20 }] }),
    doc('p', { number: '0000000002', issuedOn: '2026-08-01', vatCredit: 'PARTIAL', lines: [{ net: 200, rate: 20 }] }),
    doc('z', { number: '0000000003', lines: [{ net: 30, rate: 0 }] }),
  ],
  till,
  entries,
  inputs,
});
expectEqual(codes(view.issues, 'error'), [], 'no blocking issues');
expectEqual(codes(view.issues, 'warning'), ['ZERO_RATE_SALES', 'ZERO_VAT_EXCLUDED'], 'warnings');
expectEqual(view.purchases.map((row) => row.sourceId), ['p', 'inv', 'cn'], 'purchases in date order');
expectEqual(view.excluded.map((row) => row.sourceId), ['z'], 'zero-VAT invoice listed as excluded');
expectEqual(view.sales.map((row) => row.number), ['0000000010', 'SALES-202608-01', 'SALES-202608-02'], 'sales in date order');
expectEqual(
  ['01', '20', '11', '21', '13', '24', '19', '30', '31', '41', '32', '42', '33', '40', '50', '60'].map((cell) => view.cells[cell]),
  [1210, 231, 1110, 222, 100, 9, 5, 10, 130, 20.5, 200, 40, 0.5, 40.5, 190.5, 0],
  'return cells',
);

// Files
const files = nraFiles(view.header, view.purchases, view.sales, view.cells);
const decoded = Object.fromEntries(files.map((file) => [file.name, new TextDecoder('windows-1251').decode(file.body)]));
const records = (name: string) => decoded[name].split('\r\n').slice(0, -1);
expectEqual(decoded['DEKLAR.TXT'].endsWith('\r\n'), true, 'record ends with CRLF');
expectEqual([records('DEKLAR.TXT').length, records('POKUPKI.TXT').length, records('PRODAGBI.TXT').length], [1, 3, 3], 'record counts');
expectEqual([recordWidth(DEKLAR_FIELDS), recordWidth(POKUPKI_FIELDS), recordWidth(PRODAGBI_FIELDS)], [590, 274, 424], 'record widths');
expectEqual(records('DEKLAR.TXT').every((line) => line.length === 590), true, 'DEKLAR width');
expectEqual(records('POKUPKI.TXT').every((line) => line.length === 274), true, 'POKUPKI width');
expectEqual(records('PRODAGBI.TXT').every((line) => line.length === 424), true, 'PRODAGBI width');
const deklar = records('DEKLAR.TXT')[0];
expectEqual(deklar.slice(0, 15), 'BG123456786    ', '00-01');
expectEqual(deklar.slice(15, 65).trimEnd(), 'Метро Корнер ЕООД', '00-02');
expectEqual(deklar.slice(65, 71), '202608', '00-03');
expectEqual([deklar.slice(121, 136), deklar.slice(136, 151)], ['              3', '              3'], 'document counts');
expectEqual(deklar.slice(151, 166), '        1210.00', '01-01');
const k = 151 + 21 * 15;
expectEqual(deklar.slice(k, k + 4), '0.50', '01-33');
expectEqual(deklar.slice(k + 4, k + 19), '          40.50', '01-40');
const pok = records('POKUPKI.TXT');
expectEqual(pok.map((line) => line.slice(25, 40).trim()), ['1', '2', '3'], 'sequence numbers');
expectEqual(pok[2].slice(40, 42) + '|' + pok[2].slice(42, 62).trimEnd() + '|' + pok[2].slice(62, 72), '03|0000000077|12/08/2026', 'credit note fields');
const col41 = (line: string) => Number(line.slice(167 + 2 * 15, 167 + 3 * 15));
expectEqual(pok.reduce((sum, line) => sum + col41(line), 0), view.cells['41'], 'DEKLAR 01-41 equals the sum of 03-41');
expectEqual(pok[2].slice(167 + 15, 167 + 30), '         -20.00', 'negative amount');
const prod = records('PRODAGBI.TXT');
expectEqual(prod[1].slice(40, 42) + '|' + prod[1].slice(87, 137).trimEnd(), '81|Физически лица', 'sales report record');
expectEqual(nraFiles(view.header, [], [], view.cells)[1].body.length, 0, 'empty ledger file');

// Return result rules
const refund = returnCells([], [], 0, { coefficient: null, cell70: 0, cell71: 0, cell80: 5, cell81: 0, cell82: 0 });
expectEqual([refund['50'], refund['60']], [0, 0], 'nothing to pay or refund');
expectEqual(codes(returnIssues(refund)), ['RETURN_80_82'], 'refund cells cannot exceed 60');
expectEqual(codes(returnIssues({ ...refund, '33': 1.2, '80': 0 })), ['COEFFICIENT_RANGE'], 'coefficient range');

const noSettings = buildVatPeriod({ period: '2026-10', today: '2026-09-28', settings: { ...settings, vatNumber: null, declarant: '' }, documents: [], till: [], entries: [], inputs });
expectEqual(codes(noSettings.issues, 'error'), ['PERIOD_FUTURE', 'SETTINGS_DECLARANT', 'SETTINGS_VAT_NUMBER'], 'settings and future period block');

console.log('vat ledger ok');
