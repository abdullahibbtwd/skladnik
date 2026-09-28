import type { PaymentMethod } from '@skladnik/shared';

/** One posted till document: a sale (+1) or a void (−1, counted on the day it was voided). */
export type ReportDocument = {
  id: string;
  sign: 1 | -1;
  paymentMethod: PaymentMethod;
  /** Local hour 0–23 it was posted. */
  hour: number;
  lines: ReportLine[];
};

export type ReportLine = {
  productId: string;
  productName: string;
  productCode: string;
  group: { id: string; name: string } | null;
  quantity: number;
  /** What the customer paid for the line, VAT included. */
  gross: number;
  vatRate: number;
  /** Cost of the stock that left (quantity × unit cost of each movement); null if a movement has no cost. */
  cost: number | null;
};

type Totals = { quantity: number; gross: number; net: number; cost: number; missingCost: number };

const round2 = (value: number) => Math.round(value * 100) / 100;
const round3 = (value: number) => Math.round(value * 1000) / 1000;

function emptyTotals(): Totals {
  return { quantity: 0, gross: 0, net: 0, cost: 0, missingCost: 0 };
}

function addLine(totals: Totals, line: ReportLine, sign: 1 | -1) {
  totals.quantity += sign * line.quantity;
  totals.gross += sign * line.gross;
  totals.net += (sign * line.gross) / (1 + line.vatRate / 100);
  if (line.cost === null) totals.missingCost += 1;
  else totals.cost += sign * line.cost;
}

function profitFields(totals: Totals) {
  const profit = totals.net - totals.cost;
  return {
    cost: round2(totals.cost),
    profit: round2(profit),
    /** Gross margin: profit as a share of revenue without VAT. */
    marginPercent: totals.net > 0 ? Math.round((profit / totals.net) * 1000) / 10 : null,
  };
}

/** Day / period summary: turnover, tickets, average ticket, cash vs card, VAT, cost and profit. */
export function summarizeSales(documents: ReportDocument[]) {
  const totals = emptyTotals();
  const sales = { count: 0, gross: 0 };
  const voids = { count: 0, gross: 0 };
  const payments: Record<PaymentMethod, { count: number; amount: number }> = {
    CASH: { count: 0, amount: 0 },
    CARD: { count: 0, amount: 0 },
  };
  const hours = Array.from({ length: 24 }, (_, hour) => ({ hour, count: 0, amount: 0 }));

  for (const doc of documents) {
    let gross = 0;
    for (const line of doc.lines) {
      addLine(totals, line, doc.sign);
      gross += line.gross;
    }
    const bucket = doc.sign === 1 ? sales : voids;
    bucket.count += 1;
    bucket.gross += gross;
    payments[doc.paymentMethod].count += doc.sign;
    payments[doc.paymentMethod].amount += doc.sign * gross;
    hours[doc.hour].count += doc.sign;
    hours[doc.hour].amount += doc.sign * gross;
  }

  const tickets = sales.count - voids.count;
  const turnover = totals.gross;
  return {
    sales: { count: sales.count, amount: round2(sales.gross) },
    voids: { count: voids.count, amount: round2(voids.gross) },
    tickets,
    turnover: round2(turnover),
    net: round2(totals.net),
    vat: round2(turnover - totals.net),
    averageTicket: tickets > 0 ? round2(turnover / tickets) : 0,
    payments: {
      CASH: { count: payments.CASH.count, amount: round2(payments.CASH.amount) },
      CARD: { count: payments.CARD.count, amount: round2(payments.CARD.amount) },
    },
    hours: hours.filter((row) => row.count !== 0 || row.amount !== 0).map((row) => ({ ...row, amount: round2(row.amount) })),
    ...profitFields(totals),
    linesWithoutCost: totals.missingCost,
  };
}

export type MarginGrouping = 'product' | 'group';

/** Revenue, cost and profit per product or per product group, biggest revenue first. */
export function marginRows(documents: ReportDocument[], by: MarginGrouping) {
  const rows = new Map<string, { id: string | null; name: string; code: string | null; totals: Totals }>();
  for (const doc of documents) {
    for (const line of doc.lines) {
      const key = by === 'product' ? line.productId : (line.group?.id ?? '');
      let row = rows.get(key);
      if (!row) {
        row =
          by === 'product'
            ? { id: line.productId, name: line.productName, code: line.productCode, totals: emptyTotals() }
            : { id: line.group?.id ?? null, name: line.group?.name ?? '', code: null, totals: emptyTotals() };
        rows.set(key, row);
      }
      addLine(row.totals, line, doc.sign);
    }
  }
  return [...rows.values()]
    .map((row) => ({
      id: row.id,
      name: row.name,
      code: row.code,
      quantity: round3(row.totals.quantity),
      gross: round2(row.totals.gross),
      net: round2(row.totals.net),
      ...profitFields(row.totals),
      linesWithoutCost: row.totals.missingCost,
    }))
    .filter((row) => row.quantity !== 0 || row.gross !== 0)
    .sort((a, b) => b.net - a.net || a.name.localeCompare(b.name));
}
