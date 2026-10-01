import { issueMessage, type ComplianceFilingRecord, type ComplianceIssue } from './compliance';
import type { ReportLang } from './reports';

/**
 * Annex 38 to Наредба Н-18: the monthly standardised audit file of an e-shop (orders delivered in the month
 * and money returned), per the NRA's `dec_audit.xsd`. One file per e-shop; here an e-shop is a site with an
 * e-shop registration. Filed from the 1st to the 15th of the following month.
 */
export const ANNEX38_KIND = 'ANNEX38' as const;

export const ESHOP_TYPES = [1, 2] as const;
export type EShopType = (typeof ESHOP_TYPES)[number];

export const ESHOP_TYPE_LABELS: Record<EShopType, Record<ReportLang, string>> = {
  1: { en: 'Own website', bg: 'Собствен домейн' },
  2: { en: 'Online marketplace', bg: 'Онлайн платформа' },
};

/** `paym`: how the order was paid. */
export const ANNEX38_PAYMENT_CODES = [1, 2, 3, 4, 5, 6] as const;
export type Annex38PaymentCode = (typeof ANNEX38_PAYMENT_CODES)[number];

export const ANNEX38_PAYMENT_LABELS: Record<Annex38PaymentCode, Record<ReportLang, string>> = {
  1: { en: 'Exempt under Art. 3, without a postal money order', bg: 'Освободено по чл. 3 плащане без ППП' },
  2: { en: 'Virtual POS terminal', bg: 'Виртуален ПОС терминал' },
  3: { en: 'Cash on delivery by postal money order', bg: 'Наложен платеж с ППП' },
  4: { en: 'Payment service provider', bg: 'Доставчик на платежни услуги' },
  5: { en: 'Other payment not needing a fiscal receipt', bg: 'Друг вид плащане, неизискващо фискален бон' },
  6: { en: 'Paid with a fiscal receipt', bg: 'Плащане, отразено с фискален бон' },
};

/** `r_paym`: how the money was returned. */
export const ANNEX38_REFUND_CODES = [1, 2, 3, 4] as const;
export type Annex38RefundCode = (typeof ANNEX38_REFUND_CODES)[number];

export const ANNEX38_REFUND_LABELS: Record<Annex38RefundCode, Record<ReportLang, string>> = {
  1: { en: 'To a payment account', bg: 'По платежна сметка' },
  2: { en: 'To a card', bg: 'По карта' },
  3: { en: 'In cash', bg: 'В брой' },
  4: { en: 'Other', bg: 'Друг' },
};

/** The NRA number printed on the e-shop registration, e.g. RF0000000. */
export const ESHOP_NUMBER_PATTERN = /^RF\d{7}$/;
export const ESHOP_NUMBER_MAX = 10;
export const ESHOP_URL_MAX = 200;
export const ANNEX38_TEXT_MAX = 200;

export type EShopSettings = {
  /** `e_shop_n` */
  number: string;
  /** `domain_name` */
  webAddress: string;
  /** `e_shop_type` */
  type: EShopType;
  /** `paym` reported for till sales taken as cash / card. */
  cashPayment: Annex38PaymentCode;
  cardPayment: Annex38PaymentCode;
  /** `pos_n`, for virtual POS payments. */
  posTerminal: string | null;
  /** `proc_id`, for payment service provider payments: its tax number and name. */
  paymentProvider: string | null;
};

export const DEFAULT_ESHOP_PAYMENTS = { cashPayment: 3, cardPayment: 2 } as const satisfies Pick<EShopSettings, 'cashPayment' | 'cardPayment'>;

export type Annex38Item = {
  name: string;
  quantity: number;
  /** Unit price before discount, without VAT. */
  unitPrice: number;
  vatRate: number;
  vat: number;
  /** With VAT. */
  total: number;
};

export type Annex38Order = {
  documentId: string;
  /** `ord_n`: the sale number. */
  number: string;
  date: string;
  /** `doc_n`: the sale number's digits (the schema wants an integer). */
  docNumber: string;
  items: Annex38Item[];
  net: number;
  discount: number;
  vat: number;
  total: number;
  payment: Annex38PaymentCode;
  paymentReference: string | null;
  /** Returned later in the same month. */
  returned: boolean;
};

export type Annex38Return = {
  documentId: string;
  orderNumber: string;
  amount: number;
  date: string;
  refund: Annex38RefundCode;
  /** The order was delivered in the same month. */
  orderInPeriod: boolean;
};

export type Annex38Totals = { orders: number; items: number; net: number; vat: number; total: number; returns: number; returned: number };

export type Annex38View = {
  period: string;
  site: { id: string; name: string };
  company: { name: string; eik: string | null };
  settings: EShopSettings | null;
  orders: Annex38Order[];
  returns: Annex38Return[];
  totals: Annex38Totals;
  /** Last day to file: the 15th of the following month. */
  dueBy: string;
  issues: ComplianceIssue[];
  filings: ComplianceFilingRecord[];
  sourceHash: string;
  changedSinceFiling: boolean;
};

/** The schema's `doc_n` is an integer: S20260930-0001 → 202609300001. */
export function annex38DocNumber(saleNumber: string) {
  const digits = saleNumber.replace(/\D/g, '');
  return digits.length > 0 ? digits : null;
}

export function annex38DueDate(period: string) {
  const [year, month] = period.split('-').map(Number);
  const next = month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
  return `${next.year}-${String(next.month).padStart(2, '0')}-15`;
}

const ANNEX38_ISSUE_TEXT: Record<string, Record<ReportLang, string>> = {
  COMPANY_EIK_MISSING: { en: 'The company ЕИК is missing. Add it in Settings → Company.', bg: 'Липсва ЕИК на фирмата. Добавете го в Настройки → Фирма.' },
  COMPANY_EIK_INVALID: {
    en: 'The company ЕИК {{value}} fails the checksum. Correct it in Settings → Company.',
    bg: 'ЕИК на фирмата {{value}} не минава проверката. Коригирайте го в Настройки → Фирма.',
  },
  ESHOP_NOT_SET: {
    en: "This site is not registered as an e-shop. Annex 38 applies only to e-shop sites (Settings → Sites).",
    bg: 'Този обект не е регистриран като електронен магазин. Приложение 38 важи само за обекти с е-магазин (Настройки → Обекти).',
  },
  ESHOP_ORDERS_UNAVAILABLE: {
    en: 'The app has no e-shop order/payment data yet. Till sales are not mapped to e-shop payment types. Annex 38 files are not generated until order data exists.',
    bg: 'Приложението още няма данни за поръчки/плащания на е-магазин. Касовите продажби не се преобразуват в типове плащане за е-магазин. Файлове по Приложение 38 не се генерират, докато няма данни за поръчки.',
  },
  ESHOP_NUMBER_FORMAT: {
    en: "E-shop number {{value}} doesn't match the usual NRA format (RF and 7 digits). Check it against the registration.",
    bg: 'Номерът на е-магазина {{value}} не съвпада с обичайния формат на НАП (RF и 7 цифри). Проверете го в регистрацията.',
  },
  PERIOD_NOT_ENDED: {
    en: "{{period}} isn't over yet. Its file can be generated from {{from}}.",
    bg: '{{period}} още не е приключил. Файлът може да се генерира от {{from}}.',
  },
  NO_ORDERS: {
    en: 'No orders were delivered at this site in {{period}}. The NRA schema needs at least one order; ask your accountant how to report the month.',
    bg: 'Няма доставени поръчки в този обект за {{period}}. Схемата на НАП изисква поне една поръчка; попитайте счетоводителя как се отчита месецът.',
  },
  LINE_TOTAL_MISMATCH: {
    en: '{{document}}, line {{line}}: {{quantity}} × {{price}} is {{expected}}, but the line total is {{actual}}.',
    bg: '{{document}}, ред {{line}}: {{quantity}} × {{price}} = {{expected}}, а сумата на реда е {{actual}}.',
  },
  ORDER_TOTALS_MISMATCH: {
    en: "{{document}}: the item sums ({{items}}) don't add up to the order total ({{total}}).",
    bg: '{{document}}: сумите на артикулите ({{items}}) не дават общата стойност на поръчката ({{total}}).',
  },
  VAT_RATE_NOT_WHOLE: {
    en: "{{document}}: VAT rate {{rate}}% isn't a whole number, which the file can't hold.",
    bg: '{{document}}: ДДС ставка {{rate}}% не е цяло число, а файлът приема само цели.',
  },
  DOC_NUMBER_MISSING: {
    en: '{{document}} has no digits to use as the document number (doc_n).',
    bg: '{{document}} няма цифри, които да се ползват като номер на документа (doc_n).',
  },
  QUANTITY_ROUNDED: {
    en: '{{document}}: {{product}} quantity {{quantity}} is written as {{rounded}}; the file takes 2 decimals.',
    bg: '{{document}}: количеството на {{product}} {{quantity}} се записва като {{rounded}}; файлът приема 2 знака след запетаята.',
  },
  NAME_SHORTENED: {
    en: '{{product}}: the name is cut to 200 characters.',
    bg: '{{product}}: наименованието се съкращава до 200 знака.',
  },
  PAYMENT_REFERENCE_MISSING: {
    en: 'Orders paid by virtual POS or a payment provider without a transaction reference: {{count}}. Enter the reference at the till when taking the payment.',
    bg: 'Поръчки, платени чрез виртуален ПОС или доставчик на платежни услуги, без референтен номер на транзакцията: {{count}}. Въвеждайте го на касата при плащането.',
  },
  POS_TERMINAL_MISSING: {
    en: 'Orders are reported as virtual POS payments, but this e-shop has no terminal number.',
    bg: 'Поръчките се отчитат като плащания през виртуален ПОС, но за този е-магазин няма номер на терминал.',
  },
  PAYMENT_PROVIDER_MISSING: {
    en: 'Orders are reported as paid through a payment service provider, but this e-shop has no provider identifier.',
    bg: 'Поръчките се отчитат като платени чрез доставчик на платежни услуги, но за този е-магазин няма идентификатор на доставчика.',
  },
  LATE: { en: 'The file for {{period}} was due by {{due}}.', bg: 'Файлът за {{period}} е трябвало да се подаде до {{due}}.' },
  CHANGED_SINCE_FILING: {
    en: 'Sales changed after version {{version}} was generated. Generate a new version.',
    bg: 'Продажбите са променени след генерирането на версия {{version}}. Генерирайте нова версия.',
  },
  CURRENCY_EUR: {
    en: "Amounts are in euro, as recorded. The schema's descriptions still say leva; confirm with your accountant.",
    bg: 'Сумите са в евро, както са записани. Описанията в схемата все още посочват лева; потвърдете със счетоводителя.',
  },
  DOC_NUMBER_DERIVED: {
    en: 'The document number (doc_n) is the sale number without letters and dashes, e.g. {{example}} → {{digits}}.',
    bg: 'Номерът на документа (doc_n) е номерът на продажбата без букви и тирета, напр. {{example}} → {{digits}}.',
  },
  VOIDED_ORDERS: {
    en: 'Orders returned in the same month: {{count}}. Each is listed as an order and as a return.',
    bg: 'Поръчки, върнати през същия месец: {{count}}. Всяка е посочена и като поръчка, и като връщане.',
  },
  RETURNS_OF_EARLIER_ORDERS: {
    en: 'Returns of orders from earlier months: {{count}}. They are listed with the returns only.',
    bg: 'Връщания на поръчки от предходни месеци: {{count}}. Те са посочени само сред върнатите.',
  },
};

export function annex38IssueMessage(issue: ComplianceIssue, lang: ReportLang) {
  return issueMessage(ANNEX38_ISSUE_TEXT, issue, lang);
}
