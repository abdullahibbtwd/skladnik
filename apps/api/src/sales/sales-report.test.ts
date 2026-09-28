import { marginRows, summarizeSales, type ReportDocument, type ReportLine } from './sales-report';

function expectEqual(actual: unknown, expected: unknown, label: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${label}: expected ${e}, got ${a}`);
}

const dairy = { id: 'g1', name: 'Dairy' };
const milk = (quantity: number, gross: number, cost: number | null): ReportLine => ({
  productId: 'milk',
  productName: 'Milk',
  productCode: 'M1',
  group: dairy,
  quantity,
  gross,
  vatRate: 20,
  cost,
});
const bread: ReportLine = {
  productId: 'bread',
  productName: 'Bread',
  productCode: 'B1',
  group: null,
  quantity: 1,
  gross: 2.18,
  vatRate: 9,
  cost: 1.2,
};

const documents: ReportDocument[] = [
  { id: 's1', sign: 1, paymentMethod: 'CASH', hour: 9, lines: [milk(2, 4.8, 3), bread] },
  { id: 's2', sign: 1, paymentMethod: 'CARD', hour: 10, lines: [milk(1, 2.4, 1.5)] },
  { id: 's3', sign: 1, paymentMethod: 'CARD', hour: 10, lines: [milk(1, 2.4, 1.5)] },
  // s3 voided later the same day.
  { id: 'v3', sign: -1, paymentMethod: 'CARD', hour: 11, lines: [milk(1, 2.4, 1.5)] },
];

{
  const summary = summarizeSales(documents);
  expectEqual(summary.sales, { count: 3, amount: 11.78 }, 'sales');
  expectEqual(summary.voids, { count: 1, amount: 2.4 }, 'voids');
  expectEqual(summary.tickets, 2, 'tickets net of voids');
  expectEqual(summary.turnover, 9.38, 'turnover net of voids');
  // 7.20 / 1.2 + 2.18 / 1.09 = 6 + 2
  expectEqual(summary.net, 8, 'revenue without VAT');
  expectEqual(summary.vat, 1.38, 'VAT');
  expectEqual(summary.averageTicket, 4.69, 'average ticket');
  expectEqual(summary.payments, { CASH: { count: 1, amount: 6.98 }, CARD: { count: 1, amount: 2.4 } }, 'cash / card');
  expectEqual(summary.cost, 5.7, 'cost of goods sold');
  expectEqual(summary.profit, 2.3, 'profit');
  expectEqual(summary.marginPercent, 28.8, 'margin %');
  expectEqual(summary.hours.map((row) => [row.hour, row.count, row.amount]), [[9, 1, 6.98], [10, 2, 4.8], [11, -1, -2.4]], 'by hour');
}

{
  const rows = marginRows(documents, 'product');
  expectEqual(rows.map((row) => [row.name, row.quantity, row.net, row.cost, row.profit, row.marginPercent]), [
    ['Milk', 3, 6, 4.5, 1.5, 25],
    ['Bread', 1, 2, 1.2, 0.8, 40],
  ], 'margins per product');
  const groups = marginRows(documents, 'group');
  expectEqual(groups.map((row) => [row.id, row.name, row.net]), [['g1', 'Dairy', 6], [null, '', 2]], 'margins per group');
}

{
  const summary = summarizeSales([{ id: 's', sign: 1, paymentMethod: 'CASH', hour: 8, lines: [milk(1, 2.4, null)] }]);
  expectEqual(summary.linesWithoutCost, 1, 'missing cost is counted, not guessed');
  expectEqual(summarizeSales([]).averageTicket, 0, 'no sales');
}

console.log('sales-report tests passed');
