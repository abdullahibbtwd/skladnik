// Workstream 5 (F-01 Annex 38 e-shop audit XML) against a local API.
// Signs up a throwaway company, posts till sales, back-dates them into a closed month
// (the till always stamps today's business date), generates the file, and validates it
// against the official NRA schema with xmllint.
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

const API = process.env.API_URL ?? 'http://localhost:3003';
const PASSWORD = 'DevPassword123!';
const XSD = join(dirname(fileURLToPath(import.meta.url)), '../src/annex38/dec_audit.xsd');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function login(email) {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`login ${email} failed ${res.status} ${JSON.stringify(body)}`);
  return res.headers.getSetCookie().map((entry) => entry.split(';')[0]).join('; ');
}

async function call(cookie, method, path, payload) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { Cookie: cookie, ...(payload ? { 'Content-Type': 'application/json' } : {}) },
    body: payload ? JSON.stringify(payload) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

const ok = (res, label) => assert(res.status >= 200 && res.status < 300, `${label}: ${res.status} ${JSON.stringify(res.body)}`);

function randomEik() {
  const digits = Array.from({ length: 8 }, () => Math.floor(Math.random() * 10));
  let check = digits.reduce((sum, digit, index) => sum + digit * (index + 1), 0) % 11;
  if (check === 10) check = digits.reduce((sum, digit, index) => sum + digit * (index + 3), 0) % 11 % 10;
  return `${digits.join('')}${check}`;
}

function xmllint(bytes) {
  const dir = mkdtempSync(join(tmpdir(), 'annex38-'));
  const file = join(dir, 'audit.xml');
  writeFileSync(file, bytes);
  execFileSync('xmllint', ['--noout', '--schema', XSD, file], { stdio: 'pipe' });
}

const stamp = Date.now();
const today = new Date().toISOString().slice(0, 10);
const thisMonth = today.slice(0, 7);
const last = new Date(`${thisMonth}-01T00:00:00Z`);
last.setUTCMonth(last.getUTCMonth() - 1);
const period = last.toISOString().slice(0, 7);

const signup = await fetch(`${API}/auth/signup`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: `annex38-${stamp}@skladnik.test`,
    password: PASSWORD,
    name: 'Annex Tester',
    companyName: `Annex Shop ${stamp}`,
  }),
});
assert(signup.ok, `signup ${signup.status} ${await signup.text()}`);
const owner = signup.headers.getSetCookie().map((entry) => entry.split(';')[0]).join('; ');

const siteRes = await call(owner, 'POST', '/sites', { name: 'Web Shop', type: 'STORE' });
ok(siteRes, 'site');
const siteId = siteRes.body.site.id;

const productRes = await call(owner, 'POST', '/products', {
  name: 'Coffee beans',
  code: `A38-${stamp}`,
  unit: 'PCS',
  vatRate: 20,
  purchasePrice: 4,
  sellingPrice: 12,
});
ok(productRes, 'product');
const product = productRes.body.product;

const opening = await call(owner, 'POST', '/documents', {
  type: 'OPENING_BALANCE',
  siteId,
  documentNumber: `A38-OP-${stamp}`,
  issuedOn: `${period}-01`,
});
ok(opening, 'opening');
ok(await call(owner, 'POST', `/documents/${opening.body.document.id}/lines`, { productId: product.id, quantity: 20, unitPrice: 4 }), 'opening line');
ok(await call(owner, 'POST', `/documents/${opening.body.document.id}/submit-for-review`), 'submit opening');
ok(await call(owner, 'POST', `/documents/${opening.body.document.id}/post`, { confirmDate: true }), 'post opening');

const cash = await call(owner, 'POST', '/sales', {
  siteId,
  paymentMethod: 'CASH',
  clientRequestId: randomUUID(),
  items: [{ productId: product.id, quantity: 2 }],
});
ok(cash, 'cash sale');
const card = await call(owner, 'POST', '/sales', {
  siteId,
  paymentMethod: 'CARD',
  paymentReference: 'POS-991122',
  clientRequestId: randomUUID(),
  items: [{ productId: product.id, quantity: 1 }],
});
ok(card, 'card sale');
assert(card.body.sale.paymentReference === 'POS-991122', `payment reference ${card.body.sale.paymentReference}`);
ok(await call(owner, 'POST', `/sales/${cash.body.sale.id}/void`, { reason: 'Annex 38 return test' }), 'void');

const prisma = new PrismaClient();
const saleIds = [cash.body.sale.id, card.body.sale.id];
const voids = await prisma.document.findMany({ where: { reversalOfId: { in: saleIds } }, select: { id: true } });
assert(voids.length === 1, `expected one void, got ${voids.length}`);
await prisma.document.updateMany({
  where: { id: { in: [...saleIds, voids[0].id] } },
  data: { issuedOn: new Date(`${period}-10`) },
});
await prisma.$disconnect();

const cashier = await login('demo-cashier@skladnik.dev');
assert((await call(cashier, 'GET', `/annex38/sites/${siteId}/periods/${period}`)).status === 403, 'cashier can read another company');
assert((await call(cashier, 'GET', '/annex38/sites')).status === 403, 'cashier can list e-shops');
console.log('✓ staff cannot open Annex 38');

const blockedMonth = await call(owner, 'GET', `/annex38/sites/${siteId}/periods/${thisMonth}`);
ok(blockedMonth, 'current month view');
assert(
  blockedMonth.body.issues.some((issue) => issue.code === 'PERIOD_NOT_ENDED' && issue.severity === 'error'),
  `current month should be blocked ${JSON.stringify(blockedMonth.body.issues)}`,
);
assert((await call(owner, 'POST', `/annex38/sites/${siteId}/periods/${thisMonth}/filings`)).status === 400, 'generate current month');

const beforeSetup = await call(owner, 'GET', `/annex38/sites/${siteId}/periods/${period}`);
ok(beforeSetup, 'period before setup');
const codes = new Set(beforeSetup.body.issues.filter((issue) => issue.severity === 'error').map((issue) => issue.code));
assert(codes.has('COMPANY_EIK_MISSING'), `missing EIK ${JSON.stringify(beforeSetup.body.issues)}`);
assert(codes.has('ESHOP_NOT_SET'), `missing e-shop ${JSON.stringify(beforeSetup.body.issues)}`);
assert((await call(owner, 'POST', `/annex38/sites/${siteId}/periods/${period}/filings`)).status === 400, 'generate without checks');
console.log('✓ pre-checks block a month that has not ended, a missing UIC and an unregistered e-shop');

const eik = randomEik();
ok(await call(owner, 'PUT', '/company/profile', { name: `Annex Shop ${stamp}`, eik, vatNumber: `BG${eik}` }), 'company profile');
ok(
  await call(owner, 'PUT', `/annex38/sites/${siteId}`, {
    number: 'RF0001234',
    webAddress: 'https://annex.example',
    type: 1,
    cashPayment: 3,
    cardPayment: 2,
    posTerminal: 'VPOS-1',
    paymentProvider: 'Test Bank',
  }),
  'e-shop settings',
);

const view = await call(owner, 'GET', `/annex38/sites/${siteId}/periods/${period}`);
ok(view, 'period view');
assert(view.body.orders.length === 2, `orders ${view.body.orders.length}`);
assert(view.body.returns.length === 1, `returns ${view.body.returns.length}`);
assert(view.body.orders.every((order) => order.date.startsWith(period)), `order dates ${view.body.orders.map((o) => o.date)}`);
const cardOrder = view.body.orders.find((order) => order.documentId === card.body.sale.id);
assert(cardOrder?.payment === 2 && cardOrder.paymentReference === 'POS-991122', `card order ${JSON.stringify(cardOrder)}`);
assert(view.body.issues.filter((issue) => issue.severity === 'error').length === 0, `still blocked ${JSON.stringify(view.body.issues)}`);
assert(Math.abs(view.body.totals.total - 36) < 0.001, `total ${view.body.totals.total}`);

const filing = await call(owner, 'POST', `/annex38/sites/${siteId}/periods/${period}/filings`);
ok(filing, 'generate');
assert(filing.body.version === 1 && filing.body.kind === 'ANNEX38' && filing.body.scope === siteId, JSON.stringify(filing.body));
assert(filing.body.files[0]?.sha256 && filing.body.createdByName, `archive ${JSON.stringify(filing.body)}`);

const unchanged = await call(owner, 'POST', `/annex38/sites/${siteId}/periods/${period}/filings`);
assert(unchanged.status === 400 && /Nothing changed/.test(unchanged.body.message ?? ''), `repeat generate ${JSON.stringify(unchanged.body)}`);

const download = await fetch(`${API}/annex38/filings/${filing.body.id}/download`, { headers: { Cookie: owner } });
assert(download.ok, `download ${download.status}`);
const bytes = Buffer.from(await download.arrayBuffer());
assert(bytes.length === filing.body.files[0].size, `size ${bytes.length} vs ${filing.body.files[0].size}`);
assert(createHash('sha256').update(bytes).digest('hex') === filing.body.files[0].sha256, 'sha256 mismatch');
const xml = bytes.toString('latin1');
assert(xml.includes('encoding="windows-1251"') && xml.includes('<e_shop_n>RF0001234</e_shop_n>'), 'header');
assert(xml.includes('<trans_n>POS-991122</trans_n>'), 'card reference');
xmllint(bytes);
console.log(`✓ version 1 archived (${filing.body.files[0].name}, ${bytes.length} B) and valid against dec_audit.xsd`);

ok(
  await call(owner, 'PUT', `/annex38/sites/${siteId}`, {
    number: 'RF0001234',
    webAddress: 'https://annex.example/shop',
    type: 1,
    cashPayment: 3,
    cardPayment: 2,
    posTerminal: 'VPOS-1',
    paymentProvider: 'Test Bank',
  }),
  'change url',
);
const correction = await call(owner, 'POST', `/annex38/sites/${siteId}/periods/${period}/filings`);
ok(correction, 'correction');
assert(correction.body.version === 2, `version ${correction.body.version}`);

ok(await call(owner, 'POST', `/annex38/filings/${filing.body.id}/submitted`, { submissionRef: 'NRA-A38-1', submittedAt: today }), 'mark submitted');
const archive = await call(owner, 'GET', '/annex38/filings');
ok(archive, 'archive');
assert(archive.body.filings.length >= 2, `archive ${archive.body.filings.length}`);
const v1 = archive.body.filings.find((row) => row.id === filing.body.id);
assert(v1?.submissionRef === 'NRA-A38-1', `submitted ${JSON.stringify(v1)}`);

const activity = await call(owner, 'GET', `/activity?entityType=ComplianceFiling&q=${encodeURIComponent(period)}`);
ok(activity, 'activity');
assert(
  activity.body.entries.some((entry) => entry.action === 'GENERATE' && entry.metadata?.kind === 'ANNEX38'),
  `activity ${JSON.stringify(activity.body.entries.map((e) => e.action))}`,
);

console.log('\nAnnex 38 checks passed.');
