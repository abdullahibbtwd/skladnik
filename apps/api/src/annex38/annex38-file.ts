import {
  ANNEX38_TEXT_MAX,
  DEFAULT_ESHOP_PAYMENTS,
  ESHOP_NUMBER_PATTERN,
  annex38DocNumber,
  annex38DueDate,
  isValidEik,
  type Annex38Item,
  type Annex38Order,
  type Annex38PaymentCode,
  type Annex38RefundCode,
  type Annex38Return,
  type Annex38Totals,
  type ComplianceIssue,
  type EShopSettings,
} from '@skladnik/shared';
import { formatAmount } from '../compliance/fixed-width';
import { encodeWindows1251, inWindows1251 } from '../reports/export/csv';
import { round2 } from '../reports/report-math';

/**
 * Annex 38 to Наредба Н-18: the e-shop's monthly audit file (NRA schema `dec_audit.xsd`, copied next to this
 * file). Orders are the till sales delivered at the e-shop's site in the month; returns are the voids made in
 * the month, whichever month the order was in. Pure, so the whole file can be tested without a database.
 */

type PaymentMethod = 'CASH' | 'CARD' | 'BANK_TRANSFER' | 'OTHER';

export type Annex38SaleLine = { position: number; name: string; quantity: number; unitPrice: number; lineTotal: number; vatRate: number };

export type Annex38SaleInput = {
  id: string;
  number: string;
  date: string;
  /** OUT = the sale, IN = its void. */
  direction: 'IN' | 'OUT';
  paymentMethod: PaymentMethod | null;
  paymentReference: string | null;
  /** Voids only: the sale being returned. */
  reversalOf: { id: string; number: string; date: string } | null;
  lines: Annex38SaleLine[];
};

export type Annex38Input = {
  period: string;
  today: string;
  company: { name: string; eik: string | null };
  settings: EShopSettings | null;
  sales: Annex38SaleInput[];
};

export type Annex38Built = {
  orders: Annex38Order[];
  returns: Annex38Return[];
  totals: Annex38Totals;
  issues: ComplianceIssue[];
  dueBy: string;
};

const REFUND_BY_METHOD: Record<PaymentMethod, Annex38RefundCode> = { BANK_TRANSFER: 1, CARD: 2, CASH: 3, OTHER: 4 };

/** Whitespace collapsed, control characters dropped (XML 1.0 can't carry them). */
export function cleanText(value: string) {
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function paymentCode(method: PaymentMethod | null, settings: EShopSettings | null): Annex38PaymentCode {
  if (method === 'CARD') return (settings?.cardPayment ?? DEFAULT_ESHOP_PAYMENTS.cardPayment) as Annex38PaymentCode;
  if (method === 'CASH') return (settings?.cashPayment ?? DEFAULT_ESHOP_PAYMENTS.cashPayment) as Annex38PaymentCode;
  if (method === 'BANK_TRANSFER') return 1;
  return 5;
}

export function refundCode(method: PaymentMethod | null): Annex38RefundCode {
  return method ? REFUND_BY_METHOD[method] : 4;
}

/** Till prices include VAT; the file wants the net unit price and the VAT and gross per line. */
export function itemAmounts(line: Pick<Annex38SaleLine, 'quantity' | 'unitPrice' | 'lineTotal' | 'vatRate'>) {
  const gross = round2(line.lineTotal);
  const vat = round2((gross * line.vatRate) / (100 + line.vatRate));
  return {
    quantity: round2(line.quantity),
    unitPrice: round2((line.unitPrice * 100) / (100 + line.vatRate)),
    vat,
    net: round2(gross - vat),
    total: gross,
  };
}

const monthAfter = (period: string) => `${annex38DueDate(period).slice(0, 7)}-01`;

export function buildAnnex38(input: Annex38Input): Annex38Built {
  const { period, settings } = input;
  const issues: ComplianceIssue[] = [];
  const push = (issue: ComplianceIssue) => issues.push(issue);
  const eik = input.company.eik?.trim() ?? '';
  if (!eik) push({ severity: 'error', code: 'COMPANY_EIK_MISSING', ref: { kind: 'company' } });
  else if (!/^(\d{9}|\d{13})$/.test(eik) || !isValidEik(eik)) push({ severity: 'error', code: 'COMPANY_EIK_INVALID', params: { value: eik }, ref: { kind: 'company' } });
  if (!settings) push({ severity: 'error', code: 'ESHOP_NOT_SET', ref: { kind: 'eshop' } });
  else if (!ESHOP_NUMBER_PATTERN.test(settings.number)) push({ severity: 'warning', code: 'ESHOP_NUMBER_FORMAT', params: { value: settings.number }, ref: { kind: 'eshop' } });
  if (period >= input.today.slice(0, 7)) push({ severity: 'error', code: 'PERIOD_NOT_ENDED', params: { period, from: monthAfter(period) }, ref: { kind: 'period', period } });

  const shortened = new Set<string>();
  const orderSales = input.sales.filter((sale) => sale.direction === 'OUT' && sale.date.startsWith(period));
  const voids = input.sales.filter((sale) => sale.direction === 'IN' && sale.reversalOf && sale.date.startsWith(period));
  const returnedIds = new Set(voids.map((sale) => sale.reversalOf!.id));

  const orders: Annex38Order[] = orderSales.map((sale) => {
    const document = sale.number;
    const docRef = { kind: 'document' as const, id: sale.id, documentType: 'SALE' };
    const items: Annex38Item[] = [...sale.lines]
      .sort((a, b) => a.position - b.position)
      .map((line) => {
        const lineNo = line.position + 1;
        const expected = round2(line.quantity * line.unitPrice);
        if (Math.abs(expected - line.lineTotal) > 0.005) {
          push({
            severity: 'error',
            code: 'LINE_TOTAL_MISMATCH',
            params: { document, line: lineNo, quantity: line.quantity, price: line.unitPrice.toFixed(2), expected: expected.toFixed(2), actual: line.lineTotal.toFixed(2) },
            ref: docRef,
          });
        }
        if (!Number.isInteger(line.vatRate)) push({ severity: 'error', code: 'VAT_RATE_NOT_WHOLE', params: { document, rate: line.vatRate }, ref: docRef });
        const name = cleanText(line.name);
        if (name.length > ANNEX38_TEXT_MAX && !shortened.has(name)) {
          shortened.add(name);
          push({ severity: 'warning', code: 'NAME_SHORTENED', params: { product: `${name.slice(0, 60)}…` } });
        }
        const amounts = itemAmounts(line);
        if (amounts.quantity !== line.quantity) {
          push({ severity: 'warning', code: 'QUANTITY_ROUNDED', params: { document, product: name.slice(0, 60), quantity: line.quantity, rounded: amounts.quantity.toFixed(2) }, ref: docRef });
        }
        return { name: name.slice(0, ANNEX38_TEXT_MAX), quantity: amounts.quantity, unitPrice: amounts.unitPrice, vatRate: line.vatRate, vat: amounts.vat, total: amounts.total };
      });
    const itemSum = items.reduce((sum, item) => sum + item.total, 0);
    const total = round2(itemSum);
    const vat = round2(items.reduce((sum, item) => sum + item.vat, 0));
    const net = round2(items.reduce((sum, item) => sum + (item.total - item.vat), 0));
    const discount = 0;
    // What the file states: Σ art_sum − ord_disc = ord_total2 = ord_total1 + ord_vat.
    if (Math.abs(itemSum - discount - total) > 0.005 || Math.abs(net + vat - total) > 0.005) {
      push({ severity: 'error', code: 'ORDER_TOTALS_MISMATCH', params: { document, items: formatAmount(itemSum), total: formatAmount(total) }, ref: docRef });
    }
    const docNumber = annex38DocNumber(sale.number);
    if (!docNumber) push({ severity: 'error', code: 'DOC_NUMBER_MISSING', params: { document }, ref: docRef });
    return {
      documentId: sale.id,
      number: sale.number,
      date: sale.date,
      docNumber: docNumber ?? '',
      items,
      net,
      discount,
      vat,
      total,
      payment: paymentCode(sale.paymentMethod, settings),
      paymentReference: sale.paymentReference?.trim() || null,
      returned: returnedIds.has(sale.id),
    };
  });

  const orderIds = new Set(orders.map((order) => order.documentId));
  const returns: Annex38Return[] = voids.map((sale) => ({
    documentId: sale.id,
    orderNumber: sale.reversalOf!.number,
    amount: round2(sale.lines.reduce((sum, line) => sum + line.lineTotal, 0)),
    date: sale.date,
    refund: refundCode(sale.paymentMethod),
    orderInPeriod: orderIds.has(sale.reversalOf!.id),
  }));

  if (orders.length === 0) push({ severity: 'error', code: 'NO_ORDERS', params: { period }, ref: { kind: 'period', period } });
  const electronic = orders.filter((order) => order.payment === 2 || order.payment === 4);
  const unreferenced = electronic.filter((order) => !order.paymentReference).length;
  if (unreferenced > 0) push({ severity: 'warning', code: 'PAYMENT_REFERENCE_MISSING', params: { count: unreferenced }, ref: { kind: 'period', period } });
  if (orders.some((order) => order.payment === 2) && !settings?.posTerminal) push({ severity: 'warning', code: 'POS_TERMINAL_MISSING', ref: { kind: 'eshop' } });
  if (orders.some((order) => order.payment === 4) && !settings?.paymentProvider) push({ severity: 'warning', code: 'PAYMENT_PROVIDER_MISSING', ref: { kind: 'eshop' } });
  if (period >= '2026-01') push({ severity: 'info', code: 'CURRENCY_EUR' });
  if (orders[0]?.docNumber) push({ severity: 'info', code: 'DOC_NUMBER_DERIVED', params: { example: orders[0].number, digits: orders[0].docNumber } });
  const sameMonth = returns.filter((item) => item.orderInPeriod).length;
  if (sameMonth > 0) push({ severity: 'info', code: 'VOIDED_ORDERS', params: { count: sameMonth } });
  if (returns.length - sameMonth > 0) push({ severity: 'info', code: 'RETURNS_OF_EARLIER_ORDERS', params: { count: returns.length - sameMonth } });

  const totals: Annex38Totals = {
    orders: orders.length,
    items: orders.reduce((sum, order) => sum + order.items.length, 0),
    net: round2(orders.reduce((sum, order) => sum + order.net, 0)),
    vat: round2(orders.reduce((sum, order) => sum + order.vat, 0)),
    total: round2(orders.reduce((sum, order) => sum + order.total, 0)),
    returns: returns.length,
    returned: round2(returns.reduce((sum, item) => sum + item.amount, 0)),
  };
  return { orders, returns, totals, issues, dueBy: annex38DueDate(period) };
}

// ─── XML ─────────────────────────────────────────────────────────────────────

/** Escapes markup; characters Windows-1251 can't hold become character references, so nothing is lost. */
export function xmlText(value: string) {
  let out = '';
  for (const char of cleanText(value)) {
    const code = char.codePointAt(0)!;
    if (char === '&') out += '&amp;';
    else if (char === '<') out += '&lt;';
    else if (char === '>') out += '&gt;';
    else if (char === '"') out += '&quot;';
    else if (char === "'") out += '&apos;';
    else if (!inWindows1251(code)) out += `&#${code};`;
    else out += char;
  }
  return out;
}

export type Annex38Header = { eik: string; settings: EShopSettings; period: string; creationDate: string };

export function annex38Xml(header: Annex38Header, orders: Annex38Order[], returns: Annex38Return[]) {
  const lines: string[] = ['<?xml version="1.0" encoding="windows-1251"?>', '<audit>'];
  const el = (depth: number, name: string, value: string | number) => lines.push(`${'\t'.repeat(depth)}<${name}>${typeof value === 'number' ? value : xmlText(value)}</${name}>`);
  const open = (depth: number, name: string) => lines.push(`${'\t'.repeat(depth)}<${name}>`);
  const close = (depth: number, name: string) => lines.push(`${'\t'.repeat(depth)}</${name}>`);
  const money = (value: number) => formatAmount(value);
  const [year, month] = header.period.split('-');

  el(1, 'eik', header.eik);
  el(1, 'e_shop_n', header.settings.number);
  el(1, 'domain_name', header.settings.webAddress);
  el(1, 'e_shop_type', header.settings.type);
  el(1, 'creation_date', header.creationDate);
  el(1, 'mon', month);
  el(1, 'god', year);
  open(1, 'order');
  for (const order of orders) {
    open(2, 'orderenum');
    el(3, 'ord_n', order.number);
    el(3, 'ord_d', order.date);
    el(3, 'doc_n', order.docNumber);
    el(3, 'doc_date', order.date);
    open(3, 'art');
    for (const item of order.items) {
      open(4, 'artenum');
      el(5, 'art_name', item.name);
      el(5, 'art_quant', money(item.quantity));
      el(5, 'art_price', money(item.unitPrice));
      el(5, 'art_vat_rate', item.vatRate);
      el(5, 'art_vat', money(item.vat));
      el(5, 'art_sum', money(item.total));
      close(4, 'artenum');
    }
    close(3, 'art');
    el(3, 'ord_total1', money(order.net));
    el(3, 'ord_disc', money(order.discount));
    el(3, 'ord_vat', money(order.vat));
    el(3, 'ord_total2', money(order.total));
    el(3, 'paym', order.payment);
    if (order.payment === 2 && header.settings.posTerminal) el(3, 'pos_n', header.settings.posTerminal);
    if (order.paymentReference) el(3, 'trans_n', order.paymentReference);
    if (order.payment === 4 && header.settings.paymentProvider) el(3, 'proc_id', header.settings.paymentProvider);
    close(2, 'orderenum');
  }
  close(1, 'order');
  el(1, 'r_ord', returns.length);
  if (returns.length > 0) {
    open(1, 'rorder');
    for (const item of returns) {
      open(2, 'rorderenum');
      el(3, 'r_ord_n', item.orderNumber);
      el(3, 'r_amount', money(item.amount));
      el(3, 'r_date', item.date);
      el(3, 'r_paym', item.refund);
      close(2, 'rorderenum');
    }
    close(1, 'rorder');
  }
  el(1, 'r_total', money(returns.reduce((sum, item) => sum + item.amount, 0)));
  lines.push('</audit>');
  return `${lines.join('\r\n')}\r\n`;
}

export function annex38File(header: Annex38Header, orders: Annex38Order[], returns: Annex38Return[]) {
  return encodeWindows1251(annex38Xml(header, orders, returns));
}

export function annex38FileName(settings: EShopSettings, period: string) {
  const shop = settings.number.replace(/[^A-Za-z0-9_-]/g, '') || 'eshop';
  return `AUDIT_${shop}_${period.replace('-', '')}.xml`;
}
