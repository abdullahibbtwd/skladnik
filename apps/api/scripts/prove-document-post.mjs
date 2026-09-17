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

let partners = await json('GET', '/partners', cookie);
let partner = partners.body.partners?.[0];
if (!partner) {
  const created = await json('POST', '/partners', cookie, {
    name: `Prove Supplier ${stamp}`,
    kind: 'SUPPLIER',
  });
  assert(created.status === 201 || created.status === 200, `partner create ${created.status} ${JSON.stringify(created.body)}`);
  partner = created.body.partner;
}

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

const posted = await json('POST', `/documents/${docId}/post`, cookie);
assert(posted.status === 200 || posted.status === 201, `post ${posted.status} ${JSON.stringify(posted.body)}`);
assert(posted.body.document.status === 'POSTED', 'status is not POSTED');
assert(posted.body.document.lines.length === 2, 'expected 2 lines after post');

const milkPosted = posted.body.document.lines.find((row) => row.productId === tracked.body.product.id);
assert(milkPosted?.batch?.batchNumber === `LOT-${stamp}`, `batch not linked ${JSON.stringify(milkPosted?.batch)}`);
assert(milkPosted?.batch?.quantityRemaining === 4, `batch remaining ${milkPosted?.batch?.quantityRemaining}`);

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

console.log('Document posting proof passed.');
console.log(`  ${posted.body.document.documentNumber} POSTED, milk batch remaining=${milkPosted.batch.quantityRemaining}`);
