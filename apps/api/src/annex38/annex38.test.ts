import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { EShopSettings } from '@skladnik/shared';
import { annex38File, annex38FileName, annex38Xml, buildAnnex38, itemAmounts, xmlText, type Annex38Input, type Annex38SaleInput } from './annex38-file';

function expectEqual(actual: unknown, expected: unknown, label: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${label}: expected ${e}, got ${a}`);
}

const codes = (issues: { code: string; severity: string }[], severity?: string) =>
  issues.filter((issue) => !severity || issue.severity === severity).map((issue) => issue.code).sort();

const settings: EShopSettings = {
  number: 'RF0001234',
  webAddress: 'https://shop.example.bg',
  type: 1,
  cashPayment: 3,
  cardPayment: 2,
  posTerminal: 'VPOS-77',
  paymentProvider: null,
};

const sale = (overrides: Partial<Annex38SaleInput> & Pick<Annex38SaleInput, 'id' | 'number' | 'date'>): Annex38SaleInput => ({
  direction: 'OUT',
  paymentMethod: 'CASH',
  paymentReference: null,
  reversalOf: null,
  lines: [],
  ...overrides,
});

const sales: Annex38SaleInput[] = [
  sale({
    id: 's1',
    number: 'S20260815-0001',
    date: '2026-08-15',
    paymentMethod: 'CARD',
    paymentReference: 'TX-1',
    lines: [
      { position: 0, name: 'Кашкавал 400г', quantity: 2, unitPrice: 9, lineTotal: 18, vatRate: 20 },
      { position: 1, name: 'Хляб & мляко "Добруджа"', quantity: 1.257, unitPrice: 2.39, lineTotal: 3, vatRate: 9 },
    ],
  }),
  sale({ id: 's2', number: 'S20260820-0002', date: '2026-08-20', lines: [{ position: 0, name: 'Торта 🎂\tголяма', quantity: 1, unitPrice: 25, lineTotal: 25, vatRate: 20 }] }),
  sale({
    id: 'v2',
    number: 'S20260820-0002-V',
    date: '2026-08-21',
    direction: 'IN',
    reversalOf: { id: 's2', number: 'S20260820-0002', date: '2026-08-20' },
    lines: [{ position: 0, name: 'Торта', quantity: 1, unitPrice: 25, lineTotal: 25, vatRate: 20 }],
  }),
  sale({
    id: 'v0',
    number: 'S20260725-0003-V',
    date: '2026-08-02',
    direction: 'IN',
    paymentMethod: 'CARD',
    reversalOf: { id: 's0', number: 'S20260725-0003', date: '2026-07-25' },
    lines: [{ position: 0, name: 'Сок', quantity: 2, unitPrice: 2.5, lineTotal: 5, vatRate: 20 }],
  }),
  sale({ id: 's9', number: 'S20260901-0001', date: '2026-09-01', lines: [{ position: 0, name: 'Next month', quantity: 1, unitPrice: 1, lineTotal: 1, vatRate: 20 }] }),
];

const input: Annex38Input = { period: '2026-08', today: '2026-09-30', company: { name: 'Метро Корнер ЕООД', eik: '123456786' }, settings, sales };

// Amounts: till prices include VAT
expectEqual(itemAmounts({ quantity: 2, unitPrice: 9, lineTotal: 18, vatRate: 20 }), { quantity: 2, unitPrice: 7.5, vat: 3, net: 15, total: 18 }, '20% line');
expectEqual(itemAmounts({ quantity: 1.257, unitPrice: 2.39, lineTotal: 3, vatRate: 9 }), { quantity: 1.26, unitPrice: 2.19, vat: 0.25, net: 2.75, total: 3 }, '9% line, quantity to 2 decimals');
expectEqual(itemAmounts({ quantity: 1, unitPrice: 4, lineTotal: 4, vatRate: 0 }), { quantity: 1, unitPrice: 4, vat: 0, net: 4, total: 4 }, '0% line');

// Orders and returns
const built = buildAnnex38(input);
expectEqual(built.orders.map((order) => order.number), ['S20260815-0001', 'S20260820-0002'], 'orders delivered in the month only');
expectEqual(built.orders.map((order) => order.docNumber), ['202608150001', '202608200002'], 'doc_n is the digits of the sale number');
expectEqual(built.orders.map((order) => order.payment), [2, 3], 'card → virtual POS, cash → cash on delivery');
expectEqual(built.orders.map((order) => order.returned), [false, true], 'order voided in the month is marked');
const first = built.orders[0];
expectEqual([first.net, first.vat, first.total, first.discount], [17.75, 3.25, 21, 0], 'order totals add up');
expectEqual(built.returns, [
  { documentId: 'v2', orderNumber: 'S20260820-0002', amount: 25, date: '2026-08-21', refund: 3, orderInPeriod: true },
  { documentId: 'v0', orderNumber: 'S20260725-0003', amount: 5, date: '2026-08-02', refund: 2, orderInPeriod: false },
], 'returns in the month, including an earlier order');
expectEqual(built.totals, { orders: 2, items: 3, net: 38.58, vat: 7.42, total: 46, returns: 2, returned: 30 }, 'period totals');
expectEqual(built.dueBy, '2026-09-15', 'due by the 15th of the next month');
expectEqual(codes(built.issues, 'error'), [], 'a clean month has no errors');
expectEqual(codes(built.issues, 'warning'), ['QUANTITY_ROUNDED'], 'three-decimal quantity warned');
expectEqual(codes(built.issues, 'info'), ['CURRENCY_EUR', 'DOC_NUMBER_DERIVED', 'RETURNS_OF_EARLIER_ORDERS', 'VOIDED_ORDERS'], 'notes');

// Pre-checks
const blocked = buildAnnex38({ ...input, period: '2026-09', company: { name: 'X', eik: null }, settings: null, sales: [] });
expectEqual(codes(blocked.issues, 'error'), ['COMPANY_EIK_MISSING', 'ESHOP_NOT_SET', 'NO_ORDERS', 'PERIOD_NOT_ENDED'], 'missing data and an open month block');
expectEqual(blocked.issues.find((issue) => issue.code === 'PERIOD_NOT_ENDED')?.params, { period: '2026-09', from: '2026-10-01' }, 'open month says when it can be filed');
expectEqual(codes(buildAnnex38({ ...input, company: { name: 'X', eik: '123456789' } }).issues, 'error'), ['COMPANY_EIK_INVALID'], 'ЕИК checksum');
expectEqual(codes(buildAnnex38({ ...input, settings: { ...settings, number: 'SHOP1' } }).issues, 'warning'), ['ESHOP_NUMBER_FORMAT', 'QUANTITY_ROUNDED'], 'unusual e-shop number');

const broken = buildAnnex38({
  ...input,
  sales: [
    sale({
      id: 'b1',
      number: 'S20260810-0001',
      date: '2026-08-10',
      lines: [
        { position: 0, name: 'Wrong total', quantity: 2, unitPrice: 4, lineTotal: 10, vatRate: 20 },
        { position: 1, name: 'Odd rate', quantity: 1, unitPrice: 1, lineTotal: 1, vatRate: 9.5 },
      ],
    }),
    sale({ id: 'b2', number: 'ONLINE', date: '2026-08-11', lines: [{ position: 0, name: 'x', quantity: 1, unitPrice: 1, lineTotal: 1, vatRate: 20 }] }),
  ],
});
expectEqual(codes(broken.issues, 'error'), ['DOC_NUMBER_MISSING', 'LINE_TOTAL_MISMATCH', 'VAT_RATE_NOT_WHOLE'], 'line sums, rates and numbers checked');
expectEqual(broken.issues.find((issue) => issue.code === 'LINE_TOTAL_MISMATCH')?.params, { document: 'S20260810-0001', line: 1, quantity: 2, price: '4.00', expected: '8.00', actual: '10.00' }, 'mismatch points at the line');

const card = (id: string) => sale({ id, number: `S2026081${id.length}-000${id.length}`, date: '2026-08-12', paymentMethod: 'CARD', lines: [{ position: 0, name: 'x', quantity: 1, unitPrice: 1, lineTotal: 1, vatRate: 20 }] });
expectEqual(codes(buildAnnex38({ ...input, settings: { ...settings, posTerminal: null }, sales: [card('c')] }).issues, 'warning'), ['PAYMENT_REFERENCE_MISSING', 'POS_TERMINAL_MISSING'], 'virtual POS needs a reference and a terminal');
expectEqual(codes(buildAnnex38({ ...input, settings: { ...settings, cardPayment: 4 }, sales: [card('c')] }).issues, 'warning'), ['PAYMENT_PROVIDER_MISSING', 'PAYMENT_REFERENCE_MISSING'], 'payment provider needs its identifier');

// XML
expectEqual(xmlText('Хляб & "мляко" <1>'), 'Хляб &amp; &quot;мляко&quot; &lt;1&gt;', 'markup escaped');
expectEqual(xmlText('Торта 🎂\tголяма\u0007'), 'Торта &#127874; голяма', 'emoji kept as a reference, tabs and control characters cleaned');

const header = { eik: '123456786', settings, period: '2026-08', creationDate: '2026-09-30' };
const xml = annex38Xml(header, built.orders, built.returns);
expectEqual(xml.startsWith('<?xml version="1.0" encoding="windows-1251"?>\r\n<audit>\r\n\t<eik>123456786</eik>'), true, 'declaration and header');
expectEqual(xml.includes('<mon>08</mon>') && xml.includes('<god>2026</god>'), true, 'month and year');
expectEqual(xml.includes('<art_quant>1.26</art_quant>') && xml.includes('<art_price>2.19</art_price>') && xml.includes('<art_vat_rate>9</art_vat_rate>'), true, 'item amounts');
expectEqual(xml.includes('<pos_n>VPOS-77</pos_n>') && xml.includes('<trans_n>TX-1</trans_n>'), true, 'card payment identifiers');
expectEqual((xml.match(/<pos_n>/g) ?? []).length, 1, 'terminal only on virtual POS orders');
expectEqual(xml.includes('<r_ord>2</r_ord>') && xml.includes('<r_total>30.00</r_total>'), true, 'returns summary');

const bytes = annex38File(header, built.orders, built.returns);
expectEqual(bytes.includes(Buffer.from([0xca, 0xe0, 0xf8])), true, 'Cyrillic written as Windows-1251 bytes (Каш)');
expectEqual(bytes.includes(0x3f) && !bytes.toString('latin1').includes('Торта ?'), true, 'no character replaced by ?');
expectEqual(annex38FileName(settings, '2026-08'), 'AUDIT_RF0001234_202608.xml', 'file name');

// The official schema (dec_audit.xsd, as published by the NRA)
function xmllint(file: string) {
  try {
    execFileSync('xmllint', ['--noout', '--schema', join(__dirname, 'dec_audit.xsd'), file], { stdio: 'pipe' });
    return 'valid';
  } catch (error) {
    const err = error as NodeJS.ErrnoException & { stderr?: Buffer };
    if (err.code === 'ENOENT') return 'no-xmllint';
    return err.stderr?.toString() ?? String(error);
  }
}

const dir = mkdtempSync(join(tmpdir(), 'annex38-'));
try {
  const longName = sale({ id: 'l1', number: 'S20260805-0009', date: '2026-08-05', paymentMethod: 'CARD', lines: [{ position: 0, name: 'Я'.repeat(260), quantity: 0.5, unitPrice: 3, lineTotal: 1.5, vatRate: 0 }] });
  const withLong = buildAnnex38({ ...input, settings: { ...settings, cardPayment: 4, paymentProvider: '123456786 Борика АД' }, sales: [...sales, longName] });
  const cases = {
    'full month': annex38File(header, built.orders, built.returns),
    'no returns': annex38File(header, built.orders.slice(0, 1), []),
    'long name, provider': annex38File({ ...header, settings: { ...settings, cardPayment: 4, paymentProvider: '123456786 Борика АД' } }, withLong.orders, withLong.returns),
  };
  let checked = 0;
  for (const [label, file] of Object.entries(cases)) {
    const path = join(dir, `${label.replace(/\W+/g, '-')}.xml`);
    writeFileSync(path, file);
    const result = xmllint(path);
    if (result === 'no-xmllint') break;
    expectEqual(result, 'valid', `${label} validates against dec_audit.xsd`);
    checked += 1;
  }
  if (checked === 0) console.log('annex38: xmllint not installed, schema check skipped');
  else {
    const badPath = join(dir, 'bad-month.xml');
    writeFileSync(badPath, Buffer.from(cases['no returns'].toString('latin1').replace('<mon>08</mon>', '<mon>13</mon>'), 'latin1'));
    expectEqual(xmllint(badPath).includes('mon'), true, 'the schema check rejects an invalid month');
  }
  expectEqual(codes(withLong.issues, 'warning'), ['NAME_SHORTENED', 'PAYMENT_REFERENCE_MISSING', 'QUANTITY_ROUNDED'], 'long name warned');
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log('annex38 ok');
