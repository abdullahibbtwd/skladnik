import { VAT_SALES_BASE_FIELDS, VAT_SALES_TAX_FIELDS, type VatLedgerRow } from '@skladnik/shared';
import { fixedRecord, fixedWidthFile, type FixedField, type FixedFieldKind } from '../compliance/fixed-width';

/** Annex 12 to the VAT Act regulations (ППЗДДС): the three files uploaded to the NRA, fields in file order. */
const field = (code: string, width: number, kind: FixedFieldKind): FixedField => ({ code, width, kind });
const text = (code: string, width: number) => field(code, width, 'text');
const amount = (code: string) => field(code, 15, 'amount');

export const DEKLAR_FIELDS: readonly FixedField[] = [
  text('00-01', 15),
  text('00-02', 50),
  text('00-03', 6),
  text('00-04', 50),
  field('00-05', 15, 'int'),
  field('00-06', 15, 'int'),
  ...['01', '20', '11', '21', '12', '22', '23', '13', '24', '14', '15', '16', '17', '18', '19'].map((cell) => amount(`01-${cell}`)),
  ...['30', '31', '41', '32', '42', '43'].map((cell) => amount(`01-${cell}`)),
  field('01-33', 4, 'coefficient'),
  ...['40', '50', '60', '70', '71', '80', '81', '82'].map((cell) => amount(`01-${cell}`)),
];

export const PRODAGBI_FIELDS: readonly FixedField[] = [
  text('02-00', 15),
  text('02-01', 6),
  field('02-02', 4, 'int'),
  field('02-03', 15, 'int'),
  text('02-04', 2),
  text('02-05', 20),
  text('02-06', 10),
  text('02-07', 15),
  text('02-08', 50),
  text('02-09', 30),
  ...['10', '20', '11', '21', '12', '26', '22', '23', '13', '24', '14', '15', '16', '17', '18', '19', '25'].map((key) => amount(`02-${key}`)),
  text('02-27', 2),
];

export const POKUPKI_FIELDS: readonly FixedField[] = [
  text('03-02', 15),
  text('03-01', 6),
  field('03-03', 4, 'int'),
  field('03-04', 15, 'int'),
  text('03-05', 2),
  text('03-06', 20),
  text('03-07', 10),
  text('03-08', 15),
  text('03-09', 50),
  text('03-10', 30),
  ...['30', '31', '41', '32', '42', '43', '44'].map((key) => amount(`03-${key}`)),
  text('03-45', 2),
];

export type NraHeader = {
  vatNumber: string;
  /** YYYY-MM; written as YYYYMM. */
  period: string;
  branch: number;
};

export type DeklarHeader = NraHeader & { name: string; declarant: string };

/** ISO date → dd/mm/yyyy. */
export function nraDate(iso: string) {
  const [year, month, day] = iso.slice(0, 10).split('-');
  return `${day}/${month}/${year}`;
}

const nraPeriod = (period: string) => period.replace('-', '');

export function salesTotals(amounts: Record<string, number>) {
  const sum = (keys: readonly string[]) => keys.reduce((total, key) => total + (amounts[key] ?? 0), 0);
  return { base: sum(VAT_SALES_BASE_FIELDS), tax: sum(VAT_SALES_TAX_FIELDS) };
}

function rowHead(prefix: '02' | '03', header: NraHeader, row: VatLedgerRow, sequence: number) {
  const codes =
    prefix === '02'
      ? { vat: '02-00', period: '02-01', branch: '02-02', seq: '02-03', type: '02-04', number: '02-05', date: '02-06', id: '02-07', name: '02-08', what: '02-09' }
      : { vat: '03-02', period: '03-01', branch: '03-03', seq: '03-04', type: '03-05', number: '03-06', date: '03-07', id: '03-08', name: '03-09', what: '03-10' };
  return {
    [codes.vat]: header.vatNumber,
    [codes.period]: nraPeriod(header.period),
    [codes.branch]: header.branch,
    [codes.seq]: sequence,
    [codes.type]: row.documentType,
    [codes.number]: row.number,
    [codes.date]: nraDate(row.date),
    [codes.id]: row.partnerTaxId ?? '',
    [codes.name]: row.partnerName ?? '',
    [codes.what]: row.description,
  };
}

/** Rows must already be in ledger order; the sequence number is the position in the file. */
export function prodagbiRecords(header: NraHeader, rows: VatLedgerRow[]) {
  return rows.map((row, index) => {
    const totals = salesTotals(row.amounts);
    const values: Record<string, string | number> = { ...rowHead('02', header, row, index + 1), '02-10': totals.base, '02-20': totals.tax };
    for (const [key, value] of Object.entries(row.amounts)) values[`02-${key}`] = value;
    return fixedRecord(PRODAGBI_FIELDS, values);
  });
}

export function pokupkiRecords(header: NraHeader, rows: VatLedgerRow[]) {
  return rows.map((row, index) => {
    const values: Record<string, string | number> = rowHead('03', header, row, index + 1);
    for (const [key, value] of Object.entries(row.amounts)) values[`03-${key}`] = value;
    return fixedRecord(POKUPKI_FIELDS, values);
  });
}

export function deklarRecord(header: DeklarHeader, cells: Record<string, number>, counts: { sales: number; purchases: number }) {
  const values: Record<string, string | number> = {
    '00-01': header.vatNumber,
    '00-02': header.name,
    '00-03': nraPeriod(header.period),
    '00-04': header.declarant,
    '00-05': counts.sales,
    '00-06': counts.purchases,
  };
  for (const [cell, value] of Object.entries(cells)) values[`01-${cell}`] = value;
  return fixedRecord(DEKLAR_FIELDS, values);
}

/** An empty ledger is an empty file (no records). */
export function nraFiles(header: DeklarHeader, purchases: VatLedgerRow[], sales: VatLedgerRow[], cells: Record<string, number>) {
  return [
    { name: 'DEKLAR.TXT', body: fixedWidthFile([deklarRecord(header, cells, { sales: sales.length, purchases: purchases.length })]) },
    { name: 'POKUPKI.TXT', body: fixedWidthFile(pokupkiRecords(header, purchases)) },
    { name: 'PRODAGBI.TXT', body: fixedWidthFile(prodagbiRecords(header, sales)) },
  ];
}
