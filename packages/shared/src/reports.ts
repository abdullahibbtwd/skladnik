import type { DocumentType, WriteOffReason } from './index';

/** Accountant-facing reports (§4.6). Every kind returns the same table shape, so one exporter serves all. */
export const REPORT_KINDS = [
  'turnover',
  'stock-value',
  'batches',
  'movements',
  'top-products',
  'slow-movers',
  'write-offs',
  'stocktake-variances',
  'vat-summary',
  'vat-journal',
] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];

export function isReportKind(value: string): value is ReportKind {
  return (REPORT_KINDS as readonly string[]).includes(value);
}

export type ReportLang = 'en' | 'bg';
export type ReportColumnType = 'text' | 'date' | 'int' | 'qty' | 'price' | 'money' | 'percent';
export type ReportCell = string | number | null;
/** Keys starting with `_` (e.g. `_documentId`) are links for the screen, never exported. */
export type ReportRow = Record<string, ReportCell>;

export type ReportResult = {
  kind: ReportKind;
  title: string;
  columns: string[];
  rows: ReportRow[];
  totals: ReportRow | null;
  scope: {
    company: string;
    from: string | null;
    to: string | null;
    /** "As of" date for stock snapshots. */
    date: string | null;
    sites: { id: string; name: string }[];
    allSites: boolean;
  };
  /** Already translated, shown under the table and in exports. */
  notes: string[];
  generatedAt: string;
};

export const REPORT_TITLES: Record<ReportKind, Record<ReportLang, string>> = {
  turnover: { en: 'Turnover and profit', bg: 'Оборот и печалба' },
  'stock-value': { en: 'Stock levels and value', bg: 'Наличности и стойност' },
  batches: { en: 'Stock by batch and expiry', bg: 'Наличности по партиди и срок' },
  movements: { en: 'Product movements', bg: 'Движение на стоките' },
  'top-products': { en: 'Top products', bg: 'Най-продавани стоки' },
  'slow-movers': { en: 'Slow-moving stock', bg: 'Бавнооборотни стоки' },
  'write-offs': { en: 'Write-offs and wastage', bg: 'Брак и фира' },
  'stocktake-variances': { en: 'Stocktake variances', bg: 'Инвентаризационни разлики' },
  'vat-summary': { en: 'Purchases and sales by VAT rate', bg: 'Покупки и продажби по ставки ДДС' },
  'vat-journal': { en: 'Purchase and sales journal', bg: 'Дневник покупки и продажби' },
};

type ColumnDef = { type: ReportColumnType; en: string; bg: string };

const COLUMNS: Record<string, ColumnDef> = {
  period: { type: 'text', en: 'Period', bg: 'Период' },
  site: { type: 'text', en: 'Site', bg: 'Обект' },
  group: { type: 'text', en: 'Product group', bg: 'Група' },
  code: { type: 'text', en: 'Code', bg: 'Код' },
  product: { type: 'text', en: 'Product', bg: 'Стока' },
  unit: { type: 'text', en: 'Unit', bg: 'Мярка' },
  batch: { type: 'text', en: 'Batch', bg: 'Партида' },
  expiry: { type: 'date', en: 'Expiry', bg: 'Срок на годност' },
  expiryStatus: { type: 'text', en: 'Status', bg: 'Статус' },
  daysLeft: { type: 'int', en: 'Days left', bg: 'Остават дни' },
  date: { type: 'date', en: 'Date', bg: 'Дата' },
  documentType: { type: 'text', en: 'Document', bg: 'Документ' },
  number: { type: 'text', en: 'Number', bg: 'Номер' },
  partner: { type: 'text', en: 'Partner', bg: 'Контрагент' },
  partnerTaxId: { type: 'text', en: 'VAT / EIK', bg: 'ДДС № / ЕИК' },
  reason: { type: 'text', en: 'Reason', bg: 'Причина' },
  note: { type: 'text', en: 'Note', bg: 'Бележка' },
  createdBy: { type: 'text', en: 'By', bg: 'Съставил' },
  section: { type: 'text', en: 'Section', bg: 'Раздел' },
  rate: { type: 'text', en: 'VAT rate', bg: 'Ставка ДДС' },
  receipts: { type: 'int', en: 'Receipts', bg: 'Касови бележки' },
  documents: { type: 'int', en: 'Documents', bg: 'Документи' },
  lines: { type: 'int', en: 'Lines', bg: 'Редове' },
  products: { type: 'int', en: 'Products', bg: 'Артикули' },
  rank: { type: 'int', en: '#', bg: '№' },
  daysSinceSale: { type: 'int', en: 'Days without a sale', bg: 'Дни без продажба' },
  lastSale: { type: 'date', en: 'Last sale', bg: 'Последна продажба' },
  quantity: { type: 'qty', en: 'Quantity', bg: 'Количество' },
  onHand: { type: 'qty', en: 'On hand', bg: 'Наличност' },
  soldQty: { type: 'qty', en: 'Sold in period', bg: 'Продадено за периода' },
  openingQty: { type: 'qty', en: 'Opening qty', bg: 'Начално к-во' },
  inQty: { type: 'qty', en: 'In qty', bg: 'Заприходено к-во' },
  outQty: { type: 'qty', en: 'Out qty', bg: 'Изписано к-во' },
  closingQty: { type: 'qty', en: 'Closing qty', bg: 'Крайно к-во' },
  balance: { type: 'qty', en: 'Balance', bg: 'Салдо' },
  expected: { type: 'qty', en: 'Book qty', bg: 'Счетоводно к-во' },
  counted: { type: 'qty', en: 'Counted', bg: 'Преброено' },
  variance: { type: 'qty', en: 'Variance', bg: 'Разлика' },
  avgCost: { type: 'price', en: 'Average cost', bg: 'Средна доставна цена' },
  unitCost: { type: 'price', en: 'Unit cost', bg: 'Единична цена' },
  sellingPrice: { type: 'money', en: 'Selling price', bg: 'Продажна цена' },
  gross: { type: 'money', en: 'Turnover incl. VAT', bg: 'Оборот с ДДС' },
  net: { type: 'money', en: 'Net', bg: 'Нето' },
  vat: { type: 'money', en: 'VAT', bg: 'ДДС' },
  total: { type: 'money', en: 'Total incl. VAT', bg: 'Общо с ДДС' },
  cost: { type: 'money', en: 'Cost of goods', bg: 'Себестойност' },
  profit: { type: 'money', en: 'Gross profit', bg: 'Брутна печалба' },
  value: { type: 'money', en: 'Value at cost', bg: 'Стойност по доставни цени' },
  retailValue: { type: 'money', en: 'Value at selling price', bg: 'Стойност по продажни цени' },
  openingValue: { type: 'money', en: 'Opening value', bg: 'Начална стойност' },
  inValue: { type: 'money', en: 'In value', bg: 'Заприходена стойност' },
  outValue: { type: 'money', en: 'Out value', bg: 'Изписана стойност' },
  closingValue: { type: 'money', en: 'Closing value', bg: 'Крайна стойност' },
  varianceValue: { type: 'money', en: 'Variance value', bg: 'Стойност на разликата' },
  margin: { type: 'percent', en: 'Margin %', bg: 'Марж %' },
  share: { type: 'percent', en: 'Share %', bg: 'Дял %' },
};

const RATE_COLUMN = /^(net|vat)_(\d+(?:\.\d+)?)$/;

/** Column meaning for any key a report can return, including per-rate journal columns (`net_20`, `vat_9`). */
export function reportColumn(key: string): ColumnDef {
  const known = COLUMNS[key];
  if (known) return known;
  const rate = RATE_COLUMN.exec(key);
  if (rate) {
    return rate[1] === 'net'
      ? { type: 'money', en: `Tax base ${rate[2]}%`, bg: `Данъчна основа ${rate[2]}%` }
      : { type: 'money', en: `VAT ${rate[2]}%`, bg: `ДДС ${rate[2]}%` };
  }
  return { type: 'text', en: key, bg: key };
}

export function reportColumnLabel(key: string, lang: ReportLang) {
  return reportColumn(key)[lang];
}

/** Values the server writes into cells, in the export language. */
export const REPORT_TEXT = {
  noGroup: { en: 'No group', bg: 'Без група' },
  noPartner: { en: '—', bg: '—' },
  tillSales: { en: 'Till sales', bg: 'Продажби от каса' },
  purchases: { en: 'Purchases', bg: 'Покупки' },
  sales: { en: 'Sales', bg: 'Продажби' },
  expired: { en: 'Expired', bg: 'Изтекъл' },
  within7: { en: 'Within 7 days', bg: 'До 7 дни' },
  within30: { en: 'Within 30 days', bg: 'До 30 дни' },
  ok: { en: 'OK', bg: 'Наред' },
  noExpiry: { en: 'No date', bg: 'Без срок' },
  total: { en: 'Total', bg: 'Общо' },
  allSites: { en: 'All sites', bg: 'Всички обекти' },
  never: { en: 'Never', bg: 'Никога' },
  void: { en: 'void', bg: 'сторно' },
  missingCost: {
    en: 'Some sold lines have no known cost; cost and profit leave them out.',
    bg: 'Някои продадени редове нямат себестойност; тя и печалбата ги изключват.',
  },
  purchaseNet: {
    en: 'Purchases are posted invoices and receipt notes (credit notes that reduce stock count negative); prices exclude VAT.',
    bg: 'Покупките са осчетоводени фактури и стокови разписки (кредитни известия, намаляващи наличността, са с минус); цените са без ДДС.',
  },
  salesGross: {
    en: 'Sales are till receipts net of voids; the till price includes VAT.',
    bg: 'Продажбите са касови бележки минус сторно; цената на касата е с ДДС.',
  },
  valueFromLedger: {
    en: 'Value is the cost of every movement up to the date (perpetual inventory).',
    bg: 'Стойността е по цената на всяко движение до датата (текуща инвентаризация).',
  },
  opening: { en: 'Opening balance', bg: 'Начално салдо' },
  purchasesTotal: { en: 'Purchases total', bg: 'Общо покупки' },
  salesTotal: { en: 'Sales total', bg: 'Общо продажби' },
  receiptsRange: { en: 'receipts', bg: 'бележки' },
  shareOfAll: {
    en: 'Share is of all sales in the period, not only the rows shown.',
    bg: 'Делът е от всички продажби за периода, не само от показаните редове.',
  },
  slowWindow: {
    en: 'Stock on hand today; sales counted in the chosen period, including ingredients used by dishes.',
    bg: 'Наличност към днес; продажбите са за избрания период, вкл. съставки, изписани с ястия.',
  },
  surplus: { en: 'Surplus', bg: 'Излишък' },
  shortage: { en: 'Shortage', bg: 'Липса' },
  journalCapped: {
    en: 'Only the first 5,000 movements are listed; narrow the period.',
    bg: 'Показани са първите 5 000 движения; стеснете периода.',
  },
  tillOnly: {
    en: 'Turnover is till sales net of voids; VAT-inclusive till prices are split by each line’s rate.',
    bg: 'Оборотът е от касови продажби минус сторно; цените с ДДС са разделени по ставката на всеки ред.',
  },
  batchesToday: {
    en: 'Batch-tracked stock on hand today.',
    bg: 'Наличност към днес на стоки с проследяване на партиди.',
  },
  period: { en: 'Period', bg: 'Период' },
  asOf: { en: 'As of', bg: 'Към' },
  generated: { en: 'Generated', bg: 'Изготвен' },
  sites: { en: 'Sites', bg: 'Обекти' },
  voidSuffix: { en: '(void)', bg: '(сторно)' },
} satisfies Record<string, Record<ReportLang, string>>;

export const REPORT_UNIT_LABELS: Record<string, Record<ReportLang, string>> = {
  PCS: { en: 'pcs', bg: 'бр.' },
  PACK: { en: 'pack', bg: 'опак.' },
  KG: { en: 'kg', bg: 'кг' },
  L: { en: 'L', bg: 'л' },
  CASE: { en: 'case', bg: 'каса' },
  CARTON: { en: 'carton', bg: 'кашон' },
  JAR: { en: 'jar', bg: 'буркан' },
  OTHER: { en: 'other', bg: 'друго' },
};

export const TURNOVER_GROUPINGS = ['day', 'week', 'month', 'site', 'group'] as const;
export type TurnoverGrouping = (typeof TURNOVER_GROUPINGS)[number];
export const STOCK_VALUE_GROUPINGS = ['product', 'group', 'site'] as const;
export type StockValueGrouping = (typeof STOCK_VALUE_GROUPINGS)[number];
export const TOP_PRODUCT_METRICS = ['net', 'quantity', 'profit'] as const;
export type TopProductMetric = (typeof TOP_PRODUCT_METRICS)[number];
export const WRITE_OFF_VIEWS = ['line', 'reason', 'product'] as const;
export type WriteOffView = (typeof WRITE_OFF_VIEWS)[number];

/** Which filters each report takes: a period (from–to), an "as of" date, or neither (today). */
export const REPORT_PERIOD: Record<ReportKind, 'period' | 'date' | 'today'> = {
  turnover: 'period',
  'stock-value': 'date',
  batches: 'today',
  movements: 'period',
  'top-products': 'period',
  'slow-movers': 'period',
  'write-offs': 'period',
  'stocktake-variances': 'period',
  'vat-summary': 'period',
  'vat-journal': 'period',
};

/** Longest period one report covers. */
export const MAX_REPORT_PERIOD_DAYS = 366;

export const WRITE_OFF_REASON_LABELS: Record<WriteOffReason, Record<ReportLang, string>> = {
  EXPIRED: { en: 'Expired', bg: 'Изтекъл срок' },
  DAMAGED: { en: 'Damaged', bg: 'Повреда' },
  SPOILED: { en: 'Spoiled', bg: 'Развалена' },
  LOST: { en: 'Lost / stolen', bg: 'Липса / кражба' },
  OTHER: { en: 'Other', bg: 'Друго' },
};

export const REPORT_DOCUMENT_TYPE_LABELS: Record<DocumentType, Record<ReportLang, string>> = {
  INVOICE: { en: 'Invoice', bg: 'Фактура' },
  PROTOCOL: { en: 'Protocol', bg: 'Протокол' },
  RECEIPT: { en: 'Receipt note', bg: 'Стокова разписка' },
  CREDIT_NOTE: { en: 'Credit / debit note', bg: 'Кредитно / дебитно известие' },
  TRANSFER: { en: 'Transfer', bg: 'Преместване' },
  STOCKTAKE: { en: 'Stocktake', bg: 'Инвентаризация' },
  OPENING_BALANCE: { en: 'Opening stock', bg: 'Начални наличности' },
  SALE: { en: 'Sale', bg: 'Продажба' },
};

/** CSV layouts (§4.8) so an export imports straight into accounting software. */
export const EXPORT_DELIMITERS = [';', ',', '\t'] as const;
export type ExportDelimiter = (typeof EXPORT_DELIMITERS)[number];
export const EXPORT_DECIMAL_SEPARATORS = [',', '.'] as const;
export type ExportDecimalSeparator = (typeof EXPORT_DECIMAL_SEPARATORS)[number];
export const EXPORT_DATE_FORMATS = ['DD.MM.YYYY', 'YYYY-MM-DD', 'DD/MM/YYYY', 'MM/DD/YYYY'] as const;
export type ExportDateFormat = (typeof EXPORT_DATE_FORMATS)[number];
/** Windows-1251 is what older Bulgarian accounting software expects for Cyrillic. */
export const EXPORT_ENCODINGS = ['UTF8_BOM', 'UTF8', 'WINDOWS_1251'] as const;
export type ExportEncoding = (typeof EXPORT_ENCODINGS)[number];

export type ExportProfileColumn = { key: string; header: string };

export type CsvFormat = {
  delimiter: ExportDelimiter;
  decimalSeparator: ExportDecimalSeparator;
  dateFormat: ExportDateFormat;
  encoding: ExportEncoding;
  includeHeader: boolean;
};

/** Plain CSV download: comma-separated UTF-8 with a BOM so Excel opens Cyrillic correctly. */
export const DEFAULT_CSV_FORMAT: CsvFormat = {
  delimiter: ',',
  decimalSeparator: '.',
  dateFormat: 'YYYY-MM-DD',
  encoding: 'UTF8_BOM',
  includeHeader: true,
};

/** Columns each report can return, for building a CSV layout before running the report. */
export const REPORT_COLUMN_CHOICES: Record<ReportKind, string[]> = {
  turnover: ['date', 'period', 'site', 'group', 'receipts', 'gross', 'net', 'vat', 'cost', 'profit', 'margin'],
  'stock-value': ['site', 'code', 'product', 'group', 'unit', 'onHand', 'avgCost', 'value', 'sellingPrice', 'retailValue', 'products'],
  batches: ['site', 'code', 'product', 'batch', 'expiry', 'daysLeft', 'expiryStatus', 'unit', 'onHand', 'unitCost', 'value'],
  movements: [
    'site', 'code', 'product', 'group', 'unit', 'openingQty', 'openingValue', 'inQty', 'inValue', 'outQty', 'outValue',
    'closingQty', 'closingValue', 'date', 'documentType', 'number', 'partner', 'batch', 'unitCost', 'balance',
  ],
  'top-products': ['rank', 'code', 'product', 'group', 'unit', 'quantity', 'gross', 'net', 'cost', 'profit', 'margin', 'share'],
  'slow-movers': ['site', 'code', 'product', 'group', 'unit', 'onHand', 'value', 'soldQty', 'lastSale', 'daysSinceSale'],
  'write-offs': [
    'date', 'number', 'site', 'reason', 'code', 'product', 'batch', 'unit', 'quantity', 'unitCost', 'value', 'documents',
    'lines', 'share', 'note', 'createdBy',
  ],
  'stocktake-variances': [
    'date', 'number', 'site', 'code', 'product', 'batch', 'unit', 'expected', 'counted', 'variance', 'unitCost', 'varianceValue',
  ],
  'vat-summary': ['section', 'rate', 'documents', 'net', 'vat', 'total'],
  'vat-journal': [
    'section', 'date', 'documentType', 'number', 'partner', 'partnerTaxId', 'site',
    'net_20', 'vat_20', 'net_9', 'vat_9', 'net_0', 'vat_0', 'net', 'vat', 'total',
  ],
};
