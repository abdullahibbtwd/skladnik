import { issueMessage, type ComplianceFilingRecord, type ComplianceIssue } from './compliance';
import type { ReportLang } from './reports';

/**
 * VAT ledgers and the monthly VAT return (spec §4.7b), laid out as in Annex 12 to the VAT Act
 * regulations (ППЗДДС): purchase ledger fields 03-xx, sales ledger fields 02-xx, return cells 01-xx.
 * Amount keys are the field numbers without the file prefix ("31" = 03-31, "11" = 02-11 / cell 11).
 */

export const VAT_CREDITS = ['FULL', 'PARTIAL', 'NONE', 'EXCLUDED'] as const;
export type VatCredit = (typeof VAT_CREDITS)[number];

export const VAT_CREDIT_LABELS: Record<VatCredit, Record<ReportLang, string>> = {
  FULL: { en: 'Full credit', bg: 'Пълен данъчен кредит' },
  PARTIAL: { en: 'Partial credit', bg: 'Частичен данъчен кредит' },
  NONE: { en: 'No credit', bg: 'Без право на кредит' },
  EXCLUDED: { en: 'Not in the ledger', bg: 'Извън дневника' },
};

export const VAT_LEDGERS = ['PURCHASES', 'SALES'] as const;
export type VatLedger = (typeof VAT_LEDGERS)[number];

export const VAT_SALES_GROUPINGS = ['MONTH', 'DAY'] as const;
export type VatSalesGrouping = (typeof VAT_SALES_GROUPINGS)[number];

/** Document type codes from Annex 12. */
export const VAT_DOCUMENT_TYPES: Record<string, Record<ReportLang, string>> = {
  '01': { en: 'Invoice', bg: 'Фактура' },
  '02': { en: 'Debit note', bg: 'Дебитно известие' },
  '03': { en: 'Credit note', bg: 'Кредитно известие' },
  '07': { en: 'Customs declaration', bg: 'Митническа декларация' },
  '09': { en: 'Protocol or other document', bg: 'Протокол или друг документ' },
  '81': { en: 'Sales report', bg: 'Отчет за извършените продажби' },
  '82': { en: 'Sales report – special regime', bg: 'Отчет за продажбите при специален ред' },
};
/** Cash-accounting codes (11–13) are left out: the return totals exclude them and the regime is not supported. */
export const VAT_PURCHASE_DOCUMENT_TYPES = ['01', '02', '03', '07', '09'] as const;
export const VAT_SALES_DOCUMENT_TYPES = ['01', '02', '03', '09', '81', '82'] as const;
/** Invoices and notes carry a 10-digit number (Art. 114(1)(2) VAT Act). */
export const VAT_TEN_DIGIT_TYPES = ['01', '02', '03'];
/** Counterparty number for a foreign person with no Bulgarian registration and no EU VAT number. */
export const VAT_FOREIGN_NO_ID = '999999999999999';

export const VAT_PURCHASE_FIELDS = ['30', '31', '41', '32', '42', '43', '44'] as const;
export const VAT_SALES_FIELDS = ['11', '21', '12', '26', '22', '23', '13', '24', '14', '15', '16', '17', '18', '19', '25'] as const;
/** Sales ledger totals: 02-10 = Σ tax bases, 02-20 = Σ VAT. */
export const VAT_SALES_BASE_FIELDS = ['11', '12', '13', '14', '15', '16', '26'] as const;
export const VAT_SALES_TAX_FIELDS = ['21', '22', '23', '24'] as const;

type Label = Record<ReportLang, string> & { column: number };

/** Short labels with the column number of the printed ledger. */
export const VAT_PURCHASE_FIELD_LABELS: Record<(typeof VAT_PURCHASE_FIELDS)[number], Label> = {
  '30': { column: 9, en: 'Base and VAT, no credit', bg: 'ДО и данък без право на ДК' },
  '31': { column: 10, en: 'Base, full credit', bg: 'ДО с право на пълен ДК' },
  '41': { column: 11, en: 'VAT, full credit', bg: 'ДДС с право на пълен ДК' },
  '32': { column: 12, en: 'Base, partial credit', bg: 'ДО с право на частичен ДК' },
  '42': { column: 13, en: 'VAT, partial credit', bg: 'ДДС с право на частичен ДК' },
  '43': { column: 14, en: 'Annual adjustment Art. 73(8)', bg: 'Годишна корекция чл. 73, ал. 8' },
  '44': { column: 15, en: 'Base, triangular operation', bg: 'ДО от посредник в тристранна операция' },
};

export const VAT_SALES_FIELD_LABELS: Record<'10' | '20' | (typeof VAT_SALES_FIELDS)[number], Label> = {
  '10': { column: 9, en: 'Total tax base', bg: 'Общ размер на ДО' },
  '20': { column: 10, en: 'Total VAT', bg: 'Всичко начислен ДДС' },
  '11': { column: 11, en: 'Base 20%', bg: 'ДО 20 %' },
  '21': { column: 12, en: 'VAT 20%', bg: 'ДДС 20 %' },
  '12': { column: 13, en: 'Base, intra-EU acquisitions', bg: 'ДО на ВОП' },
  '26': { column: 14, en: 'Base, Art. 82(2)–(5)', bg: 'ДО по чл. 82, ал. 2–5' },
  '22': { column: 15, en: 'VAT, acquisitions and Art. 82', bg: 'ДДС за ВОП и чл. 82' },
  '23': { column: 16, en: 'VAT, personal use', bg: 'ДДС за лични нужди' },
  '13': { column: 17, en: 'Base 9%', bg: 'ДО 9 %' },
  '24': { column: 18, en: 'VAT 9%', bg: 'ДДС 9 %' },
  '14': { column: 19, en: 'Base 0%, chapter 3', bg: 'ДО 0 % по глава трета' },
  '15': { column: 20, en: 'Base 0%, intra-EU supplies', bg: 'ДО 0 % на ВОД' },
  '16': { column: 21, en: 'Base 0%, Art. 140, 146, 173', bg: 'ДО 0 % по чл. 140, 146, 173' },
  '17': { column: 22, en: 'Services Art. 21(2), other EU state', bg: 'Услуги по чл. 21, ал. 2' },
  '18': { column: 23, en: 'Supplies Art. 69(2), distance sales', bg: 'Доставки по чл. 69, ал. 2' },
  '19': { column: 24, en: 'Exempt supplies', bg: 'Освободени доставки' },
  '25': { column: 25, en: 'Triangular operations (intermediary)', bg: 'Посредник в тристранни операции' },
};

export const VAT_RETURN_SECTIONS = [
  { key: 'sales', cells: ['01', '20', '11', '21', '12', '22', '23', '13', '24', '14', '15', '16', '17', '18', '19'] },
  { key: 'purchases', cells: ['30', '31', '41', '32', '42', '43'] },
  { key: 'result', cells: ['33', '40', '50', '60', '70', '71', '80', '81', '82'] },
] as const;

export const VAT_RETURN_CELL_LABELS: Record<string, Record<ReportLang, string>> = {
  '01': { en: 'Total tax base', bg: 'Общ размер на данъчните основи за облагане с ДДС' },
  '20': { en: 'Total VAT charged', bg: 'Всичко начислен ДДС' },
  '11': { en: 'Tax base 20%', bg: 'ДО на облагаемите доставки 20 %' },
  '21': { en: 'VAT 20%', bg: 'Начислен ДДС 20 %' },
  '12': { en: 'Base, intra-EU acquisitions and Art. 82(2)–(6)', bg: 'ДО на ВОП и на доставки по чл. 82, ал. 2–6' },
  '22': { en: 'VAT, intra-EU acquisitions and Art. 82(2)–(6)', bg: 'Начислен ДДС за ВОП и доставки по чл. 82, ал. 2–6' },
  '23': { en: 'VAT on supplies for personal use', bg: 'Начислен ДДС за доставки за лични нужди' },
  '13': { en: 'Tax base 9%', bg: 'ДО на облагаемите доставки 9 %' },
  '24': { en: 'VAT 9%', bg: 'Начислен ДДС 9 %' },
  '14': { en: 'Base 0%, chapter 3 VAT Act', bg: 'ДО 0 % по глава трета от ЗДДС' },
  '15': { en: 'Base 0%, intra-EU supplies of goods', bg: 'ДО 0 % на ВОД на стоки' },
  '16': { en: 'Base 0%, Art. 140, 146, 173', bg: 'ДО 0 % по чл. 140, 146 и 173' },
  '17': { en: 'Services under Art. 21(2) in another EU state', bg: 'ДО на услуги по чл. 21, ал. 2 в друга държава членка' },
  '18': { en: 'Supplies under Art. 69(2), distance sales, triangular', bg: 'ДО на доставки по чл. 69, ал. 2 и тристранни операции' },
  '19': { en: 'Exempt supplies and exempt acquisitions', bg: 'ДО на освободените доставки и освободените ВОП' },
  '30': { en: 'Purchases without credit or without VAT (base and VAT)', bg: 'ДО и данък на доставки без право на ДК или без данък' },
  '31': { en: 'Base, purchases with full credit', bg: 'ДО на доставки с право на пълен ДК' },
  '41': { en: 'VAT with full credit', bg: 'Начислен ДДС с право на пълен ДК' },
  '32': { en: 'Base, purchases with partial credit', bg: 'ДО на доставки с право на частичен ДК' },
  '42': { en: 'VAT with partial credit', bg: 'Начислен ДДС с право на частичен ДК' },
  '43': { en: 'Annual adjustment Art. 73(8)', bg: 'Годишна корекция по чл. 73, ал. 8' },
  '33': { en: 'Coefficient Art. 73(5)', bg: 'Коефициент по чл. 73, ал. 5' },
  '40': { en: 'Total tax credit (41 + 42 × 33 + 43)', bg: 'Общо данъчен кредит (41 + 42 × 33 + 43)' },
  '50': { en: 'VAT payable (20 − 40 ≥ 0)', bg: 'ДДС за внасяне (20 − 40 ≥ 0)' },
  '60': { en: 'VAT refundable (20 − 40 < 0)', bg: 'ДДС за възстановяване (20 − 40 < 0)' },
  '70': { en: 'Payable, deducted under Art. 92(1)', bg: 'За внасяне, приспаднат по чл. 92, ал. 1' },
  '71': { en: 'Payable, actually paid', bg: 'За внасяне, ефективно внесен' },
  '80': { en: 'Refund under Art. 92(1)', bg: 'За възстановяване по чл. 92, ал. 1' },
  '81': { en: 'Refund under Art. 92(3)', bg: 'За възстановяване по чл. 92, ал. 3' },
  '82': { en: 'Refund under Art. 92(4)', bg: 'За възстановяване по чл. 92, ал. 4' },
};

export const VAT_ISSUE_TEXT: Record<string, Record<ReportLang, string>> = {
  SETTINGS_VAT_NUMBER: {
    en: "Add the company's VAT number (BG followed by 9 or 10 digits) in Settings → Company.",
    bg: 'Добавете ДДС номера на фирмата (BG и 9 или 10 цифри) в Настройки → Фирма.',
  },
  SETTINGS_VAT_NUMBER_INVALID: {
    en: "The company's VAT number {{value}} is not valid. Correct it in Settings → Company.",
    bg: 'ДДС номерът на фирмата {{value}} не е валиден. Поправете го в Настройки → Фирма.',
  },
  SETTINGS_DECLARANT: { en: 'Add the person submitting the return (EGN or name).', bg: 'Добавете лицето, подаващо декларацията (ЕГН или име).' },
  PERIOD_FUTURE: { en: 'This period has not started yet.', bg: 'Този период още не е започнал.' },
  PERIOD_OPEN: { en: 'The period is not over yet; more documents may arrive.', bg: 'Периодът още не е приключил; може да има още документи.' },
  DOC_NUMBER_MISSING: { en: '{{document}}: the document has no number.', bg: '{{document}}: документът няма номер.' },
  DOC_NUMBER_FORMAT: { en: '{{document}}: an invoice or note number must be 10 digits.', bg: '{{document}}: номерът на фактура или известие трябва да е от 10 цифри.' },
  DOC_NUMBER_LONG: { en: '{{document}}: the number is longer than 20 characters.', bg: '{{document}}: номерът е по-дълъг от 20 знака.' },
  DOC_NUMBER_PADDED: { en: '{{document}} is written as {{padded}} (10 digits).', bg: '{{document}} се записва като {{padded}} (10 цифри).' },
  PARTNER_MISSING: { en: '{{document}}: no supplier. A VAT credit needs the supplier and its VAT number.', bg: '{{document}}: няма доставчик. За данъчен кредит са нужни доставчикът и ДДС номерът му.' },
  PARTNER_TAX_ID_MISSING: { en: '{{document}}: {{partner}} has no VAT number.', bg: '{{document}}: {{partner}} няма ДДС номер.' },
  PARTNER_TAX_ID_INVALID: { en: '{{document}}: {{value}} is not a valid VAT or identification number.', bg: '{{document}}: {{value}} не е валиден ДДС или идентификационен номер.' },
  TAX_ID_ASSUMED_BG: { en: '{{partner}}: VAT number written as {{value}}.', bg: '{{partner}}: ДДС номерът се записва като {{value}}.' },
  RATE_UNSUPPORTED: { en: '{{document}}: the VAT rate {{rate}}% has no cell in the VAT return.', bg: '{{document}}: ставката {{rate}}% няма клетка в справка-декларацията.' },
  DUPLICATE_DOCUMENT: { en: '{{document}} is in the purchase ledger twice.', bg: '{{document}} е два пъти в дневника за покупките.' },
  CREDIT_EXPIRED: { en: '{{document}} dated {{date}}: VAT credit can be claimed only within 12 months of the document.', bg: '{{document}} от {{date}}: данъчен кредит се ползва до 12 месеца след документа.' },
  PERIOD_BEFORE_DOCUMENT: { en: '{{document}} dated {{date}} cannot be declared in an earlier period.', bg: '{{document}} от {{date}} не може да се декларира в по-ранен период.' },
  AMOUNT_TOO_LONG: { en: '{{field}}: the amount is too large for the file.', bg: '{{field}}: сумата е твърде голяма за файла.' },
  EMPTY_ROW: { en: '{{document}} has no amounts.', bg: '{{document}} няма суми.' },
  MIXED_SIGNS: { en: '{{document}} has positive and negative amounts in one row; split it into separate documents.', bg: '{{document}} има положителни и отрицателни суми в един ред; разделете го на отделни документи.' },
  PARTNER_NAME_MISSING: { en: '{{document}}: a counterparty number needs the counterparty name.', bg: '{{document}}: при номер на контрагент е нужно и името му.' },
  DOC_DATE_AFTER_PERIOD: { en: '{{document}} is dated {{date}}, after the end of the period.', bg: '{{document}} е с дата {{date}}, след края на периода.' },
  DOC_TYPE_INVALID: { en: '{{document}}: document type {{value}} is not allowed in this ledger.', bg: '{{document}}: вид документ {{value}} не е допустим в този дневник.' },
  TEXT_SHORTENED: { en: '{{document}}: {{field}} is shortened to {{width}} characters in the file.', bg: '{{document}}: {{field}} се съкращава до {{width}} знака във файла.' },
  COEFFICIENT_RANGE: { en: 'The coefficient (cell 33) must be between 0.00 and 1.00.', bg: 'Коефициентът (клетка 33) трябва да е между 0.00 и 1.00.' },
  COEFFICIENT_MISSING: { en: 'Partial credit is claimed (cell 42 = {{amount}}) but the coefficient in cell 33 is 0.', bg: 'Има частичен кредит (клетка 42 = {{amount}}), а коефициентът в клетка 33 е 0.' },
  RETURN_70_71: { en: 'Cells 70 and 71 together cannot exceed cell 50 ({{max}}).', bg: 'Клетки 70 и 71 общо не може да надвишават клетка 50 ({{max}}).' },
  RETURN_80_82: { en: 'Cells 80, 81 and 82 together cannot exceed cell 60 ({{max}}).', bg: 'Клетки 80, 81 и 82 общо не може да надвишават клетка 60 ({{max}}).' },
  UNPOSTED_DOCUMENTS: { en: 'Invoices and notes dated in this period that are not posted, so not in the ledger: {{count}}.', bg: 'Фактури и известия с дата в периода, които не са осчетоводени и не са в дневника: {{count}}.' },
  ZERO_VAT_EXCLUDED: { en: 'Posted invoices without VAT left out of the purchase ledger: {{count}}. Include them as "No credit" if the supplier is VAT-registered.', bg: 'Осчетоводени фактури без ДДС извън дневника за покупките: {{count}}. Включете ги като „Без право на кредит“, ако доставчикът е регистриран по ДДС.' },
  RECEIPTS_NOT_TAX_DOCUMENTS: { en: 'Receipt notes in this period: {{count}}. They are not tax documents; post the supplier invoice to claim the VAT.', bg: 'Стокови разписки в периода: {{count}}. Те не са данъчни документи; осчетоводете фактурата, за да ползвате данъчен кредит.' },
  REVERSED_DOCUMENTS: { en: 'Reversed invoices and notes left out of the purchase ledger: {{count}}. A reversal is an internal correction, not a tax document.', bg: 'Сторнирани фактури и известия извън дневника за покупките: {{count}}. Сторното е вътрешна корекция, а не данъчен документ.' },
  LATE_DOCUMENT: { en: '{{document}} dated {{date}} was posted after {{period}} was filed. Move it into this period to claim the VAT.', bg: '{{document}} от {{date}} е осчетоводен след подаването за {{period}}. Преместете го в този период, за да ползвате данъчния кредит.' },
  ZERO_RATE_SALES: { en: 'Till sales at 0% ({{amount}}) are declared as exempt supplies (cell 19).', bg: 'Касовите продажби с 0 % ({{amount}}) се декларират като освободени доставки (клетка 19).' },
  CHANGED_SINCE_FILING: { en: 'The books changed after version {{version}} was generated. Generate a new version as a correction.', bg: 'Данните са променени след версия {{version}}. Генерирайте нова версия като корекция.' },
};

export function vatIssueMessage(issue: ComplianceIssue, lang: ReportLang) {
  return issueMessage(VAT_ISSUE_TEXT, issue, lang);
}

// ─── Periods ────────────────────────────────────────────────────────────────

export function isVatPeriod(value: string) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

export function vatPeriodOf(date: string) {
  return date.slice(0, 7);
}

export function shiftVatPeriod(period: string, months: number) {
  const [year, month] = period.split('-').map(Number);
  const index = year * 12 + (month - 1) + months;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
}

export function vatPeriodRange(period: string) {
  const [year, month] = period.split('-').map(Number);
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { from: `${period}-01`, to: `${period}-${String(last).padStart(2, '0')}` };
}

// ─── API shapes ─────────────────────────────────────────────────────────────

export type VatSettingsRecord = {
  /** From the company profile; edited in Settings → Company. */
  vatNumber: string | null;
  legalName: string | null;
  declarant: string | null;
  branch: number;
  salesGrouping: VatSalesGrouping;
  coefficient: number;
  companyName: string;
};

export type VatSettingsInput = Omit<VatSettingsRecord, 'companyName' | 'vatNumber'>;

export type VatReturnInputs = {
  coefficient: number | null;
  cell70: number;
  cell71: number;
  cell80: number;
  cell81: number;
  cell82: number;
};

export type VatRowSource = 'document' | 'till' | 'entry';

export type VatLedgerRow = {
  key: string;
  source: VatRowSource;
  /** Document id or manual entry id; null for till reports. */
  sourceId: string | null;
  /** Skladnik document type (INVOICE, CREDIT_NOTE) for links. */
  appDocumentType: string | null;
  siteName: string | null;
  documentType: string;
  /** As written in the file (invoice numbers padded to 10 digits). */
  number: string;
  date: string;
  partnerTaxId: string | null;
  partnerName: string | null;
  description: string;
  amounts: Record<string, number>;
  /** Purchases from documents: the treatment in effect and whether it was chosen by hand. */
  credit: VatCredit | null;
  creditOverride: boolean;
  /** Period the document is declared in when moved by hand. */
  periodOverride: string | null;
};

export type VatPeriodView = {
  period: string;
  settings: VatSettingsRecord;
  purchases: VatLedgerRow[];
  sales: VatLedgerRow[];
  /** Posted purchase documents of the period that are not in the ledger. */
  excluded: VatLedgerRow[];
  cells: Record<string, number>;
  inputs: VatReturnInputs;
  issues: ComplianceIssue[];
  filings: ComplianceFilingRecord[];
  sourceHash: string;
  changedSinceFiling: boolean;
};

export type VatEntryRecord = {
  id: string;
  ledger: VatLedger;
  period: string;
  documentType: string;
  number: string;
  issuedOn: string;
  partnerTaxId: string | null;
  partnerName: string | null;
  description: string | null;
  amounts: Record<string, number>;
};

export type VatEntryInput = Omit<VatEntryRecord, 'id'>;
