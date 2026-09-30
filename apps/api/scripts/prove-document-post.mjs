const API = process.env.API_URL ?? 'http://localhost:3003';
const PASSWORD = 'DevPassword123!';

function cookieHeader(setCookie) {
  return setCookie.map((entry) => entry.split(';')[0]).join('; ');
}

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
  if (!res.ok) throw new Error(`login failed ${res.status} ${JSON.stringify(body)}`);
  return { body, cookie: cookieHeader(res.headers.getSetCookie()) };
}

async function json(method, path, cookie, payload) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Cookie: cookie,
      ...(payload ? { 'Content-Type': 'application/json' } : {}),
    },
    body: payload ? JSON.stringify(payload) : undefined,
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

const owner = await login('owner-a@skladnik.dev');
const cookie = owner.cookie;
const stamp = Date.now();

const sites = await json('GET', '/sites', cookie);
assert(sites.status === 200, `sites ${sites.status}`);
const site = sites.body.sites.find((row) => row.isActive) ?? sites.body.sites[0];
assert(site, 'no site for owner A');

function randomEik() {
  const digits = Array.from({ length: 8 }, () => Math.floor(Math.random() * 10));
  let check = digits.reduce((sum, digit, index) => sum + digit * (index + 1), 0) % 11;
  if (check === 10) check = digits.reduce((sum, digit, index) => sum + digit * (index + 3), 0) % 11 % 10;
  return `${digits.join('')}${check}`;
}

// Posting checks the partner's ЕИК, so use a fresh supplier rather than whatever local data holds.
const createdPartner = await json('POST', '/partners', cookie, {
  name: `Prove Supplier ${stamp}`,
  kind: 'SUPPLIER',
  eik: randomEik(),
});
assert(createdPartner.status === 201 || createdPartner.status === 200, `partner create ${createdPartner.status} ${JSON.stringify(createdPartner.body)}`);
const partner = createdPartner.body.partner;

const tracked = await json('POST', '/products', cookie, {
  name: `Prove Milk ${stamp}`,
  code: `PROVE-M-${stamp}`,
  unit: 'PCS',
  vatRate: 20,
  purchasePrice: 1.1,
  sellingPrice: 1.6,
  batchTracking: true,
});
assert(tracked.status === 201 || tracked.status === 200, `tracked product ${tracked.status} ${JSON.stringify(tracked.body)}`);

const plain = await json('POST', '/products', cookie, {
  name: `Prove Flour ${stamp}`,
  code: `PROVE-F-${stamp}`,
  unit: 'KG',
  vatRate: 20,
  purchasePrice: 0.8,
  sellingPrice: 1.2,
  batchTracking: false,
});
assert(plain.status === 201 || plain.status === 200, `plain product ${plain.status} ${JSON.stringify(plain.body)}`);

const created = await json('POST', '/documents', cookie, {
  type: 'INVOICE',
  siteId: site.id,
  partnerId: partner.id,
  documentNumber: `PROVE-${stamp}`,
  issuedOn: '2026-09-17',
});
assert(created.status === 201 || created.status === 200, `create document ${created.status} ${JSON.stringify(created.body)}`);
const docId = created.body.document.id;
assert(created.body.document.status === 'DRAFT', 'new document is not DRAFT');
assert(created.body.document.direction === 'IN', 'invoice should default IN');

const blockedBatch = await json('POST', `/documents/${docId}/lines`, cookie, {
  productId: tracked.body.product.id,
  quantity: 4,
  unitPrice: 1.25,
  discountPercent: 10,
});
assert(blockedBatch.status === 400, `batch-tracked line without lot should 400, got ${blockedBatch.status}`);

const withBatch = await json('POST', `/documents/${docId}/lines`, cookie, {
  productId: tracked.body.product.id,
  quantity: 4,
  unitPrice: 1.25,
  discountPercent: 10,
  batchNumber: `LOT-${stamp}`,
  expiryDate: '2026-12-31',
});
assert(withBatch.status === 200 || withBatch.status === 201, `batch line ${withBatch.status} ${JSON.stringify(withBatch.body)}`);
const milk = withBatch.body.document.lines[0];
assert(milk.finalUnitPrice === 1.125, `finalUnitPrice ${milk.finalUnitPrice}`);
assert(milk.lineTotal === 4.5, `lineTotal ${milk.lineTotal}`);

const withPlain = await json('POST', `/documents/${docId}/lines`, cookie, {
  productId: plain.body.product.id,
  qty: 2,
  unitPrice: 3,
});
assert(withPlain.status === 200 || withPlain.status === 201, `plain line ${withPlain.status} ${JSON.stringify(withPlain.body)}`);

const tooEarly = await json('POST', `/documents/${docId}/post`, cookie);
assert(tooEarly.status === 400, `post from DRAFT should 400, got ${tooEarly.status}`);

const submitted = await json('POST', `/documents/${docId}/submit-for-review`, cookie);
assert(submitted.body.document.status === 'REVIEW', `submit status ${submitted.body.document?.status}`);
const calculated = submitted.body.document.totals?.calculated;
assert(
  calculated?.taxableBase === 10.5 && calculated?.vat === 2.1 && calculated?.total === 12.6,
  `calculated totals ${JSON.stringify(calculated)}`,
);

const noTotal = await json('POST', `/documents/${docId}/post`, cookie);
assert(noTotal.status === 400, `invoice without a printed total should 400, got ${noTotal.status}`);
assert(/grand total/.test(noTotal.body.message), `missing-total message ${JSON.stringify(noTotal.body)}`);

const wrongTotal = await json('PATCH', `/documents/${docId}`, cookie, { printedTotal: 50.26 });
assert(wrongTotal.status === 200, `set printed total ${wrongTotal.status} ${JSON.stringify(wrongTotal.body)}`);
assert(wrongTotal.body.document.totals.status === 'MISMATCH', `totals status ${wrongTotal.body.document.totals?.status}`);
assert(wrongTotal.body.posting.ok === false, 'mismatched totals should not be postable');
const blockedTotal = await json('POST', `/documents/${docId}/post`, cookie);
assert(blockedTotal.status === 400, `wrong-total invoice should 400, got ${blockedTotal.status}`);
assert(/doesn't match the lines/.test(blockedTotal.body.message), `mismatch message ${JSON.stringify(blockedTotal.body)}`);

const rightTotal = await json('PATCH', `/documents/${docId}`, cookie, {
  printedTaxableBase: 10.5,
  printedVatAmount: 2.1,
  printedTotal: 12.61,
  paymentMethod: 'BANK_TRANSFER',
});
assert(rightTotal.status === 200, `set printed totals ${rightTotal.status} ${JSON.stringify(rightTotal.body)}`);
assert(rightTotal.body.document.totals.status === 'MATCH', `a 1-cent rounding difference should match ${JSON.stringify(rightTotal.body.document.totals)}`);
assert(rightTotal.body.document.paymentMethod === 'BANK_TRANSFER', 'payment method not saved');

const posted = await json('POST', `/documents/${docId}/post`, cookie);
assert(posted.status === 200 || posted.status === 201, `post ${posted.status} ${JSON.stringify(posted.body)}`);
assert(posted.body.document.status === 'POSTED', 'status is not POSTED');
assert(posted.body.document.lines.length === 2, 'expected 2 lines after post');

const milkPosted = posted.body.document.lines.find((row) => row.productId === tracked.body.product.id);
assert(milkPosted?.batch?.batchNumber === `LOT-${stamp}`, `batch not linked ${JSON.stringify(milkPosted?.batch)}`);

const flourPosted = posted.body.document.lines.find((row) => row.productId === plain.body.product.id);
assert(flourPosted?.batch === null, 'non-batch line should not have a batch');

const locked = await json('POST', `/documents/${docId}/lines`, cookie, {
  productId: plain.body.product.id,
  quantity: 1,
  unitPrice: 1,
});
assert(locked.status === 400, `posted document still writable ${locked.status}`);

const cancelPosted = await json('POST', `/documents/${docId}/cancel`, cookie);
assert(cancelPosted.status === 400, 'posted document was cancelled');

// Duplicates are per supplier + type + number: suppliers number their invoices independently.
const otherPartner = await json('POST', '/partners', cookie, { name: `Prove Supplier B ${stamp}`, kind: 'SUPPLIER' });
assert(otherPartner.status === 201 || otherPartner.status === 200, `partner B ${otherPartner.status} ${JSON.stringify(otherPartner.body)}`);
const sameNumber = { siteId: site.id, documentNumber: `PROVE-${stamp}`, issuedOn: '2026-09-17' };

const otherSupplier = await json('POST', '/documents', cookie, { ...sameNumber, type: 'INVOICE', partnerId: otherPartner.body.partner.id });
assert(otherSupplier.status === 201 || otherSupplier.status === 200, `same number, other supplier should be accepted, got ${otherSupplier.status} ${JSON.stringify(otherSupplier.body)}`);

const otherType = await json('POST', '/documents', cookie, { ...sameNumber, type: 'PROTOCOL', partnerId: partner.id });
assert(otherType.status === 201 || otherType.status === 200, `same number, other type should be accepted, got ${otherType.status} ${JSON.stringify(otherType.body)}`);

const duplicate = await json('POST', '/documents', cookie, { ...sameNumber, type: 'INVOICE', partnerId: partner.id });
assert(duplicate.status === 409, `same supplier + type + number should 409, got ${duplicate.status}`);
assert(duplicate.body.code === 'DUPLICATE_DOCUMENT', `duplicate code ${JSON.stringify(duplicate.body)}`);
assert(duplicate.body.existingDocument?.id === docId, `duplicate should link the posted invoice ${JSON.stringify(duplicate.body.existingDocument)}`);

const retarget = await json('PATCH', `/documents/${otherSupplier.body.document.id}`, cookie, { partnerId: partner.id });
assert(retarget.status === 409 && retarget.body.existingDocument?.id === docId, `moving onto the same supplier should 409, got ${retarget.status}`);

// F-10: the misread 12.03.2027 date blocks posting.
const futureDate = await json('PATCH', `/documents/${otherSupplier.body.document.id}`, cookie, { issuedOn: '2027-03-12' });
assert(futureDate.status === 200, `set future date ${futureDate.status} ${JSON.stringify(futureDate.body)}`);
await json('POST', `/documents/${otherSupplier.body.document.id}/lines`, cookie, { productId: plain.body.product.id, quantity: 1, unitPrice: 5 });
await json('PATCH', `/documents/${otherSupplier.body.document.id}`, cookie, { printedTaxableBase: 5, printedVatAmount: 1, printedTotal: 6 });
await json('POST', `/documents/${otherSupplier.body.document.id}/submit-for-review`, cookie);
const futurePost = await json('POST', `/documents/${otherSupplier.body.document.id}/post`, cookie);
assert(futurePost.status === 400 && /in the future/.test(futurePost.body.message), `future date should block, got ${futurePost.status} ${JSON.stringify(futurePost.body)}`);

// F-10: older than 90 days needs confirmDate.
await json('PATCH', `/documents/${otherSupplier.body.document.id}`, cookie, { issuedOn: '2026-01-10' });
const oldPreview = await json('GET', `/documents/${otherSupplier.body.document.id}`, cookie);
assert(oldPreview.body.posting?.confirmDate === true, `old date should ask for confirmation ${JSON.stringify(oldPreview.body.posting)}`);
const oldBlocked = await json('POST', `/documents/${otherSupplier.body.document.id}/post`, cookie);
assert(oldBlocked.status === 400 && /Confirm the date/.test(oldBlocked.body.message), `old date without flag should 400, got ${oldBlocked.status} ${JSON.stringify(oldBlocked.body)}`);

// MGR F-05: invoice without a supplier cannot post.
const noSupplier = await json('POST', '/documents', cookie, { siteId: site.id, type: 'INVOICE', documentNumber: `NOSUP-${stamp}`, issuedOn: '2026-09-17' });
assert(noSupplier.status === 201 || noSupplier.status === 200, `draft without partner ok ${noSupplier.status}`);
await json('POST', `/documents/${noSupplier.body.document.id}/lines`, cookie, { productId: plain.body.product.id, quantity: 1, unitPrice: 1 });
await json('PATCH', `/documents/${noSupplier.body.document.id}`, cookie, { printedTaxableBase: 1, printedVatAmount: 0.2, printedTotal: 1.2 });
await json('POST', `/documents/${noSupplier.body.document.id}/submit-for-review`, cookie);
const noSupplierPost = await json('POST', `/documents/${noSupplier.body.document.id}/post`, cookie);
assert(noSupplierPost.status === 400 && /supplier/i.test(noSupplierPost.body.message), `missing supplier should 400, got ${noSupplierPost.status} ${JSON.stringify(noSupplierPost.body)}`);
await json('POST', `/documents/${noSupplier.body.document.id}/cancel`, cookie);

// MGR F-05: a site manager can create a supplier (but not open Partners settings in the UI).
const manager = await login('manager-a@skladnik.dev');
const managerPartner = await json('POST', '/partners', manager.cookie, {
  name: `Manager Supplier ${stamp}`,
  kind: 'SUPPLIER',
  eik: randomEik(),
});
assert(managerPartner.status === 201 || managerPartner.status === 200, `manager create partner ${managerPartner.status} ${JSON.stringify(managerPartner.body)}`);

// F-11: receiving an expired batch needs confirmExpired.
const expiredDoc = await json('POST', '/documents', cookie, {
  type: 'INVOICE',
  siteId: site.id,
  partnerId: partner.id,
  documentNumber: `EXP-${stamp}`,
  issuedOn: '2026-09-17',
});
await json('POST', `/documents/${expiredDoc.body.document.id}/lines`, cookie, {
  productId: tracked.body.product.id,
  quantity: 1,
  unitPrice: 2,
  batchNumber: `EXP-LOT-${stamp}`,
  expiryDate: '2026-01-01',
});
await json('PATCH', `/documents/${expiredDoc.body.document.id}`, cookie, { printedTaxableBase: 2, printedVatAmount: 0.4, printedTotal: 2.4 });
await json('POST', `/documents/${expiredDoc.body.document.id}/submit-for-review`, cookie);
const expiredBlocked = await json('POST', `/documents/${expiredDoc.body.document.id}/post`, cookie);
assert(expiredBlocked.status === 400 && /expired/i.test(expiredBlocked.body.message), `expired batch without flag should 400, got ${expiredBlocked.status} ${JSON.stringify(expiredBlocked.body)}`);
const expiredPosted = await json('POST', `/documents/${expiredDoc.body.document.id}/post`, cookie, { confirmExpired: true });
assert(expiredPosted.status === 200 || expiredPosted.status === 201, `expired with confirm ${expiredPosted.status} ${JSON.stringify(expiredPosted.body)}`);

for (const extra of [otherSupplier, otherType]) {
  await json('POST', `/documents/${extra.body.document.id}/cancel`, cookie);
}

console.log('Document posting proof passed.');
console.log(`  ${posted.body.document.documentNumber} POSTED, milk batch ${milkPosted.batch.batchNumber}`);
console.log('  wrong printed total blocked, same number from another supplier accepted, duplicate linked, future date blocked');
console.log('  old date / missing supplier / expired batch confirmations enforced; site manager can create a supplier');
