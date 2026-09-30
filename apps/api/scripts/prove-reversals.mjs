// Workstream 4 (F-04 reversals, F-22 receipt notes and VAT) against a local API. Writes test documents: local only.
import { randomUUID } from 'node:crypto';

const API = process.env.API_URL ?? 'http://localhost:3003';
const PASSWORD = 'DevPassword123!';

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

const owner = await login('demo-owner@skladnik.dev');
const stamp = Date.now();
const today = new Date().toISOString().slice(0, 10);
const period = today.slice(0, 7);

const sites = (await call(owner, 'GET', '/sites')).body.sites.filter((site) => site.isActive);
const store = sites.find((site) => site.name === 'Main Store') ?? sites[0];
const warehouse = sites.find((site) => site.id !== store.id);
assert(store && warehouse, 'demo company needs two active sites');

const eik = randomEik();
const partnerRes = await call(owner, 'POST', '/partners', { name: `Reversal Supplier ${stamp}`, kind: 'SUPPLIER', eik, vatNumber: `BG${eik}` });
ok(partnerRes, 'partner');
const partner = partnerRes.body.partner;

const product = async (name, batchTracking) => {
  const res = await call(owner, 'POST', '/products', {
    name: `${name} ${stamp}`,
    code: `REV-${name.slice(0, 3).toUpperCase()}-${stamp}`,
    unit: 'PCS',
    vatRate: 20,
    purchasePrice: 1,
    sellingPrice: 5,
    batchTracking,
  });
  ok(res, `product ${name}`);
  return res.body.product;
};
const milk = await product('Milk', true);
const flour = await product('Flour', false);
const lot = `LOT-${stamp}`;

const level = async (siteId, productId) => {
  const res = await call(owner, 'GET', `/stock?siteId=${siteId}`);
  ok(res, 'stock');
  const item = res.body.items.find((row) => row.productId === productId);
  return {
    onHand: item?.onHand ?? 0,
    avgCost: item?.avgCost ?? null,
    batchCost: item?.batches?.find((batch) => batch.batchNumber === lot)?.unitCost ?? null,
  };
};

/** Creates, fills and posts a purchase document; lines are [product, quantity, price, batch?]. */
async function postPurchase(type, number, lines, { cookie = owner, siteId = store.id, partnerId = partner.id, issuedOn = today } = {}) {
  const created = await call(cookie, 'POST', '/documents', { type, siteId, partnerId, documentNumber: number, issuedOn });
  ok(created, `create ${type} ${number}`);
  const id = created.body.document.id;
  for (const [item, quantity, unitPrice, batchNumber] of lines) {
    ok(
      await call(cookie, 'POST', `/documents/${id}/lines`, {
        productId: item.id,
        quantity,
        unitPrice,
        ...(batchNumber ? { batchNumber, expiryDate: '2027-06-30' } : {}),
      }),
      `line ${item.name}`,
    );
  }
  const net = lines.reduce((sum, [, quantity, price]) => sum + quantity * price, 0);
  const cents = (value) => Math.round(value * 100) / 100;
  ok(
    await call(cookie, 'PATCH', `/documents/${id}`, { printedTaxableBase: cents(net), printedVatAmount: cents(net * 0.2), printedTotal: cents(net * 1.2) }),
    'printed totals',
  );
  ok(await call(cookie, 'POST', `/documents/${id}/submit-for-review`), 'submit');
  const posted = await call(cookie, 'POST', `/documents/${id}/post`, { confirmDate: issuedOn !== today });
  ok(posted, `post ${number}`);
  return posted.body.document;
}

const vatFiled = (await call(owner, 'GET', `/vat/periods/${period}`)).body.filings?.length > 0;
async function reverse(id, reason) {
  let res = await call(owner, 'POST', `/documents/${id}/reverse`, { reason });
  if (res.status === 400 && res.body.code === 'FILED_PERIOD_CONFIRM') {
    assert(vatFiled, 'asked to confirm a filed period that has no filing');
    res = await call(owner, 'POST', `/documents/${id}/reverse`, { reason, confirmFiledPeriod: true });
  }
  return res;
}

// ─── F-04: reversing a purchase ────────────────────────────────────────────────

// A first delivery of the batch at 2.00, so the reversed one has something to blend with.
await postPurchase('INVOICE', `REV-A-${stamp}`, [[milk, 10, 2, lot]]);
const before = { milk: await level(store.id, milk.id), flour: await level(store.id, flour.id) };

const invoiceNumber = `REV-B-${stamp}`;
const invoice = await postPurchase('INVOICE', invoiceNumber, [
  [milk, 10, 4, lot],
  [flour, 6, 1.5],
]);
const afterPost = await level(store.id, milk.id);
assert(afterPost.onHand === before.milk.onHand + 10 && afterPost.batchCost === 3, `batch blends 2.00 and 4.00: ${JSON.stringify(afterPost)}`);
assert(invoice.reversible === true && invoice.reversedBy === null, 'posted invoice is reversible');

const noReason = await call(owner, 'POST', `/documents/${invoice.id}/reverse`, { reason: '' });
assert(noReason.status === 400, `a reason is required, got ${noReason.status}`);

const reversed = await reverse(invoice.id, 'Entered with the wrong quantities');
ok(reversed, 'reverse invoice');
const reversal = reversed.body.document;
assert(reversal.documentNumber === `${invoiceNumber}-СТ`, `reversal number ${reversal.documentNumber}`);
assert(reversal.type === 'INVOICE' && reversal.direction === 'OUT' && reversal.status === 'POSTED', `reversal header ${JSON.stringify(reversal)}`);
assert(reversal.reversalOf?.id === invoice.id && reversal.reversible === false, 'reversal links the original');
assert(reversal.lines.find((line) => line.productId === milk.id)?.batch?.batchNumber === lot, 'reversal line keeps the batch');

const original = (await call(owner, 'GET', `/documents/${invoice.id}`)).body.document;
assert(original.status === 'POSTED' && original.reversedBy?.id === reversal.id, `original marked reversed ${JSON.stringify(original.reversedBy)}`);
assert(original.reversedBy.reason === 'Entered with the wrong quantities' && original.reversible === false, 'reason shown on the original');

const after = { milk: await level(store.id, milk.id), flour: await level(store.id, flour.id) };
assert(after.milk.onHand === before.milk.onHand && after.flour.onHand === before.flour.onHand, `stock back ${JSON.stringify({ before, after })}`);
assert(after.milk.batchCost === before.milk.batchCost, `batch cost back to ${before.milk.batchCost}, got ${after.milk.batchCost}`);
assert(after.milk.avgCost === before.milk.avgCost, `average back to ${before.milk.avgCost}, got ${after.milk.avgCost}`);

const movements = await call(owner, 'GET', `/stock/movements?siteId=${store.id}&productId=${milk.id}`);
ok(movements, 'movements');
const reversalMoves = movements.body.movements.filter((row) => row.document?.id === reversal.id);
assert(reversalMoves.length === 1 && reversalMoves[0].direction === 'OUT' && reversalMoves[0].quantity === 10, `batch movement ${JSON.stringify(reversalMoves)}`);
assert(reversalMoves[0].unitCost === 4 && reversalMoves[0].document.reversal === true, 'undone at the price it came in at');

assert((await reverse(invoice.id, 'again')).status === 409, 'second reversal refused');
assert((await reverse(reversal.id, 'undo the undo')).status === 400, 'a reversal cannot be reversed');
console.log(`✓ purchase reversed by ${reversal.documentNumber}: stock, batch cost and average back, original marked reversed`);

// The corrected invoice can be entered with the same number, and reversed again as -СТ2.
const corrected = await postPurchase('INVOICE', invoiceNumber, [[flour, 5, 1.5]]);
const again = await reverse(corrected.id, 'Test: second reversal of the same number');
ok(again, 'reverse the re-entered invoice');
assert(again.body.document.documentNumber === `${invoiceNumber}-СТ2`, `second reversal number ${again.body.document.documentNumber}`);
console.log('✓ same number re-entered after a reversal; its own reversal is numbered -СТ2');

// Goods already sold can't be taken back out by a reversal.
const soldLot = `${lot}-S`;
const soldInvoice = await postPurchase('INVOICE', `REV-C-${stamp}`, [[milk, 2, 3, soldLot]]);
const soldBatchId = soldInvoice.lines[0].batch.id;
const sale = await call(owner, 'POST', '/sales', {
  siteId: store.id,
  paymentMethod: 'CASH',
  clientRequestId: randomUUID(),
  items: [{ productId: milk.id, quantity: 2, batchId: soldBatchId }],
});
ok(sale, 'sale');
const blocked = await reverse(soldInvoice.id, 'Should be refused');
assert(blocked.status === 400 && /only 0 is left/.test(blocked.body.message), `sold stock blocks the reversal ${JSON.stringify(blocked.body)}`);
ok(await call(owner, 'POST', `/sales/${sale.body.sale.id}/void`, { reason: 'Reversal test' }), 'void the sale');
ok(await reverse(soldInvoice.id, 'Allowed once the sale was voided'), 'reverse after the void');
console.log('✓ sold stock blocks a reversal; after the till void it goes through');

// A transfer is undone at both sites.
const whBefore = await level(warehouse.id, flour.id);
await postPurchase('INVOICE', `REV-D-${stamp}`, [[flour, 8, 1.2]], { siteId: warehouse.id });
const transferRes = await call(owner, 'POST', '/documents', { type: 'TRANSFER', siteId: warehouse.id, targetSiteId: store.id, issuedOn: today });
ok(transferRes, 'transfer');
const transferId = transferRes.body.document.id;
ok(await call(owner, 'POST', `/documents/${transferId}/lines`, { productId: flour.id, quantity: 3, unitPrice: 0 }), 'transfer line');
ok(await call(owner, 'POST', `/documents/${transferId}/submit-for-review`), 'submit transfer');
ok(await call(owner, 'POST', `/documents/${transferId}/post`, {}), 'post transfer');
const storeMid = await level(store.id, flour.id);
const transferReversal = await reverse(transferId, 'Sent to the wrong site');
ok(transferReversal, 'reverse transfer');
assert(
  transferReversal.body.document.site.id === store.id && transferReversal.body.document.targetSite.id === warehouse.id,
  'transfer reversal runs from the receiver back',
);
assert((await level(warehouse.id, flour.id)).onHand === whBefore.onHand + 8, 'warehouse back to its stock');
assert((await level(store.id, flour.id)).onHand === storeMid.onHand - 3, 'store gave the 3 back');
console.log('✓ transfer reversed at both sites');

// ─── F-22 and VAT treatment of reversals ─────────────────────────────────────────

const receipt = await postPurchase('RECEIPT', `REV-R-${stamp}`, [[flour, 4, 1]]);
const journal = await call(owner, 'GET', `/reports/vat-journal?from=${today}&to=${today}`);
ok(journal, 'vat journal');
const journalNumbers = new Set(journal.body.rows.map((row) => row.number).filter(Boolean));
assert(!journalNumbers.has(receipt.documentNumber), 'receipt note left out of the purchase journal');
assert(journalNumbers.has(corrected.documentNumber) === false, 'reversed invoice left out of the journal');
assert(!journalNumbers.has(reversal.documentNumber), 'reversal left out of the journal');
assert(journalNumbers.has(`REV-D-${stamp}`), 'a standing invoice is in the journal');
assert(journal.body.notes.some((note) => /Receipt notes are not tax documents/.test(note)), 'journal explains the receipt rule');

const vat = await call(owner, 'GET', `/vat/periods/${period}`);
ok(vat, 'vat period');
const ledgerNumbers = new Set(vat.body.purchases.map((row) => row.number));
assert(!ledgerNumbers.has(invoiceNumber) && !ledgerNumbers.has(reversal.documentNumber), 'reversed invoice and its reversal out of the purchase ledger');
assert(ledgerNumbers.has(`REV-D-${stamp}`), 'standing invoice in the purchase ledger');
assert(vat.body.issues.some((issue) => issue.code === 'REVERSED_DOCUMENTS'), 'ledger notes the reversed documents');
console.log('✓ VAT: receipt notes and reversed documents stay out of the journal and the purchase ledger');

// Reversing an invoice whose VAT return was already generated needs an explicit confirmation. A fresh company keeps
// the return free of whatever else local data holds; the period is last month because the current one can't be filed.
const signup = await fetch(`${API}/auth/signup`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: `reversal-${stamp}@skladnik.test`, password: PASSWORD, name: 'Reversal Tester', companyName: `Reversal Co ${stamp}` }),
});
assert(signup.ok, `signup ${signup.status} ${await signup.text()}`);
const fresh = signup.headers.getSetCookie().map((entry) => entry.split(';')[0]).join('; ');
const ownEik = randomEik();
ok(await call(fresh, 'PUT', '/company/profile', { name: `Reversal Co ${stamp}`, eik: ownEik, vatNumber: `BG${ownEik}` }), 'company profile');
ok(await call(fresh, 'PUT', '/vat/settings', { legalName: null, declarant: 'Reversal Tester', branch: 0, salesGrouping: 'MONTH', coefficient: 1 }), 'vat settings');
const freshSite = await call(fresh, 'POST', '/sites', { name: 'Shop', type: 'STORE' });
ok(freshSite, 'site');
const supplierEik = randomEik();
const freshPartner = await call(fresh, 'POST', '/partners', { name: 'Filed Supplier', kind: 'SUPPLIER', eik: supplierEik, vatNumber: `BG${supplierEik}` });
ok(freshPartner, 'partner');
const freshProduct = await call(fresh, 'POST', '/products', { name: 'Sugar', code: 'SUGAR', unit: 'PCS', vatRate: 20, purchasePrice: 1, sellingPrice: 2 });
ok(freshProduct, 'product');

const lastMonth = new Date(`${period}-01T00:00:00Z`);
lastMonth.setUTCMonth(lastMonth.getUTCMonth() - 1);
const filedPeriod = lastMonth.toISOString().slice(0, 7);
const filedInvoice = await postPurchase('INVOICE', String(stamp).slice(-10), [[freshProduct.body.product, 5, 2]], {
  cookie: fresh,
  siteId: freshSite.body.site.id,
  partnerId: freshPartner.body.partner.id,
  issuedOn: `${filedPeriod}-15`,
});
ok(await call(fresh, 'POST', `/vat/periods/${filedPeriod}/filings`), 'generate VAT return');

const unconfirmed = await call(fresh, 'POST', `/documents/${filedInvoice.id}/reverse`, { reason: 'Filed period test' });
assert(unconfirmed.status === 400 && unconfirmed.body.code === 'FILED_PERIOD_CONFIRM', `filed period asks first ${JSON.stringify(unconfirmed.body)}`);
assert((await call(fresh, 'GET', `/documents/${filedInvoice.id}`)).body.document.reversedBy === null, 'nothing reversed before confirming');
ok(await call(fresh, 'POST', `/documents/${filedInvoice.id}/reverse`, { reason: 'Filed period test', confirmFiledPeriod: true }), 'confirmed reversal');
const refiled = (await call(fresh, 'GET', `/vat/periods/${filedPeriod}`)).body;
assert(refiled.changedSinceFiling === true && refiled.purchases.length === 0, 'return flagged as changed, invoice gone from the ledger');
console.log('✓ filed VAT period: reversal asks for confirmation, then flags the return for a correction');

// ─── Activity log ──────────────────────────────────────────────────────────────

const activity = await call(owner, 'GET', `/activity?entityType=Document&q=${encodeURIComponent(invoiceNumber)}`);
ok(activity, 'activity');
const actions = activity.body.entries.map((entry) => `${entry.entityLabel}:${entry.action}`);
assert(actions.includes(`${invoiceNumber}:REVERSE`) && actions.includes(`${invoiceNumber}-СТ:REVERSAL`), `activity ${JSON.stringify(actions)}`);
console.log('✓ activity log records the reversal on both documents');

console.log('\nReversal checks passed.');
