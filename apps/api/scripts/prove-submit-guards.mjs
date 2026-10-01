/**
 * Section A API guards (SKL-01/02/03/09/10) — call the API directly, not through the UI.
 *
 *   API_URL=http://localhost:3003 SEED_PASSWORD='…' node scripts/prove-submit-guards.mjs
 */
const API = process.env.API_URL ?? 'http://localhost:3003';
const PASSWORD = process.env.SEED_PASSWORD ?? 'DevPassword123!';

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

function randomEik() {
  const digits = Array.from({ length: 8 }, () => Math.floor(Math.random() * 10));
  let check = digits.reduce((sum, digit, index) => sum + digit * (index + 1), 0) % 11;
  if (check === 10) check = digits.reduce((sum, digit, index) => sum + digit * (index + 3), 0) % 11 % 10;
  return `${digits.join('')}${check}`;
}

const owner = await login('owner-a@skladnik.dev');
const cookie = owner.cookie;
const stamp = Date.now();

const sites = await json('GET', '/sites', cookie);
const site = sites.body.sites.find((row) => row.isActive) ?? sites.body.sites[0];
assert(site, 'no site');

const partner = await json('POST', '/partners', cookie, {
  name: `Guard Supplier ${stamp}`,
  kind: 'SUPPLIER',
  eik: randomEik(),
});
assert(partner.status < 300, `partner ${partner.status}`);

const product = await json('POST', '/products', cookie, {
  name: `Guard Milk ${stamp}`,
  code: `G-M-${stamp}`,
  unit: 'PCS',
  vatRate: 20,
  purchasePrice: 1,
  sellingPrice: 1.5,
  batchTracking: true,
});
assert(product.status < 300, `product ${product.status}`);
const productId = product.body.product.id;

async function draft(number, issuedOn = '2026-09-15') {
  const created = await json('POST', '/documents', cookie, {
    type: 'INVOICE',
    siteId: site.id,
    partnerId: partner.body.partner.id,
    documentNumber: number,
    issuedOn,
  });
  assert(created.status < 300, `create ${created.status} ${JSON.stringify(created.body)}`);
  return created.body.document.id;
}

async function addLine(docId, extras = {}) {
  const res = await json('POST', `/documents/${docId}/lines`, cookie, {
    productId,
    quantity: 1,
    unitPrice: 10,
    batchNumber: extras.batchNumber ?? `LOT-${stamp}`,
    expiryDate: extras.expiryDate ?? '2026-12-31',
    ...extras,
  });
  assert(res.status < 300, `line ${res.status} ${JSON.stringify(res.body)}`);
  return res;
}

// SKL-10: empty document cannot submit
{
  const id = await draft(`EMPTY-${stamp}`);
  const submit = await json('POST', `/documents/${id}/submit-for-review`, cookie);
  assert(submit.status === 400, `empty submit should 400, got ${submit.status}`);
  assert(submit.body.code === 'DOCUMENT_EMPTY_LINES' || /Добавете поне един ред/.test(submit.body.message), JSON.stringify(submit.body));
  await json('POST', `/documents/${id}/cancel`, cookie);
  console.log('✓ SKL-10 empty lines block submit');
}

// SKL-02: future date cannot submit
{
  const id = await draft(`FUTURE-${stamp}`, '2027-03-12');
  await addLine(id);
  const submit = await json('POST', `/documents/${id}/submit-for-review`, cookie);
  assert(submit.status === 400, `future submit should 400, got ${submit.status}`);
  assert(submit.body.code === 'DOCUMENT_DATE_FUTURE' || /бъдещето|future/i.test(submit.body.message), JSON.stringify(submit.body));
  await json('POST', `/documents/${id}/cancel`, cookie);
  console.log('✓ SKL-02 future date blocks submit');
}

// SKL-01 / SKL-03: number=batch and pending product — Staff may submit, post is blocked
{
  const id = await draft(`BATCHEQ-${stamp}`);
  await addLine(id, { batchNumber: `BATCHEQ-${stamp}` });
  const detail = await json('GET', `/documents/${id}`, cookie);
  assert(detail.body.posting?.canSubmit === true, `canSubmit with number=batch ${JSON.stringify(detail.body.posting)}`);
  assert(
    (detail.body.posting?.reviewWarnings ?? []).some((w) => /партида|batch/i.test(w)),
    `reviewWarnings for number=batch ${JSON.stringify(detail.body.posting?.reviewWarnings)}`,
  );
  const submit = await json('POST', `/documents/${id}/submit-for-review`, cookie);
  assert(submit.status < 300, `submit with number=batch should work ${submit.status}`);
  await json('PATCH', `/documents/${id}`, cookie, { printedTaxableBase: 10, printedVatAmount: 2, printedTotal: 12 });
  const post = await json('POST', `/documents/${id}/post`, cookie);
  assert(post.status === 400, `post with number=batch should 400, got ${post.status}`);
  await json('POST', `/documents/${id}/cancel`, cookie).catch(() => {});
  // may already be REVIEW — cancel as manager
  await json('POST', `/documents/${id}/cancel`, cookie);
  console.log('✓ SKL-01 number=batch: submit ok, post blocked');
}

// SKL-03: PENDING_REVIEW product — submit allowed, post blocked
{
  const pending = await json('POST', '/products', cookie, {
    name: `Pending Scan ${stamp}`,
    code: `G-P-${stamp}`,
    unit: 'PCS',
    vatRate: 20,
    purchasePrice: 1,
    sellingPrice: null,
    batchTracking: false,
    status: 'PENDING_REVIEW',
  });
  // Some installs reject status on create — fall back to patch.
  let pendingId = pending.body.product?.id;
  if (!pendingId) {
    const created = await json('POST', '/products', cookie, {
      name: `Pending Scan ${stamp}`,
      code: `G-P-${stamp}`,
      unit: 'PCS',
      vatRate: 20,
      purchasePrice: 1,
      sellingPrice: 1.5,
      batchTracking: false,
    });
    assert(created.status < 300, `pending product create ${created.status}`);
    pendingId = created.body.product.id;
    await json('PATCH', `/products/${pendingId}`, cookie, { status: 'PENDING_REVIEW' });
  }
  const id = await draft(`PENDING-${stamp}`);
  const line = await json('POST', `/documents/${id}/lines`, cookie, {
    productId: pendingId,
    quantity: 1,
    unitPrice: 10,
  });
  assert(line.status < 300, `pending line ${line.status}`);
  const detail = await json('GET', `/documents/${id}`, cookie);
  assert(detail.body.posting?.canSubmit === true, `canSubmit with pending ${JSON.stringify(detail.body.posting)}`);
  assert(
    (detail.body.posting?.reviewWarnings ?? []).some((w) => /непрегледан|PENDING|сканиране/i.test(w)),
    `reviewWarnings pending ${JSON.stringify(detail.body.posting?.reviewWarnings)}`,
  );
  const submit = await json('POST', `/documents/${id}/submit-for-review`, cookie);
  assert(submit.status < 300, `submit with pending should work ${submit.status}`);
  await json('PATCH', `/documents/${id}`, cookie, { printedTaxableBase: 10, printedVatAmount: 2, printedTotal: 12 });
  const post = await json('POST', `/documents/${id}/post`, cookie);
  assert(post.status === 400, `post with pending should 400, got ${post.status}`);
  await json('POST', `/documents/${id}/cancel`, cookie);
  console.log('✓ SKL-03 pending product: submit ok, post blocked');
}

// SKL-09: case/whitespace variant duplicate
{
  const id = await draft(`QA-TEST-001-${stamp}`);
  await addLine(id);
  await json('PATCH', `/documents/${id}`, cookie, { printedTaxableBase: 10, printedVatAmount: 2, printedTotal: 12 });
  await json('POST', `/documents/${id}/submit-for-review`, cookie);
  await json('POST', `/documents/${id}/post`, cookie);

  const dup = await json('POST', '/documents', cookie, {
    type: 'INVOICE',
    siteId: site.id,
    partnerId: partner.body.partner.id,
    documentNumber: ` qa-test-001-${stamp} `,
    issuedOn: '2026-09-15',
  });
  assert(dup.status === 409, `case-variant duplicate should 409, got ${dup.status}`);
  assert(dup.body.code === 'DUPLICATE_DOCUMENT', JSON.stringify(dup.body));
  assert(dup.body.existingDocument?.id === id, JSON.stringify(dup.body.existingDocument));
  console.log('✓ SKL-09 normalised duplicate rejected');
}

console.log('Submit/post guards proof passed.');
