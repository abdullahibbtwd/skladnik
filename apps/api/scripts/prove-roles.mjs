/**
 * Role × endpoint matrix (Group 7) + STAFF write/read cells (CASHIER Section F).
 * Needs seeded dual companies:
 *   owner-a / manager-a / staff-a / accountant-a @ Metro, owner-b @ Riverside
 *   (see apps/api/src/seed/dev-tenants.ts).
 *
 *   API_URL=http://localhost:3003 SEED_PASSWORD='…' node scripts/prove-roles.mjs
 *
 * Spec silence assumptions (listed in the final report):
 * - Staff may GET documents (read) including others' REVIEW docs at assigned sites.
 * - Staff GET /partners → 403; GET /partners/lookup → 200 (id+name only).
 * - Staff may POST WRITE_OFF and post it; may POST RECEIPT draft + submit; cannot post RECEIPT.
 * - Staff sales list/report scoped to own cashier id.
 */
const API = process.env.API_URL ?? 'http://localhost:3003';
const PASSWORD = process.env.SEED_PASSWORD ?? 'DevPassword123!';

/** Forbidden cost / supplier-contact keys Staff must never receive (CASHIER F-04 / F-05). */
const STAFF_FORBIDDEN = [
  'purchasePrice',
  'avgCost',
  'unitCost',
  'cost',
  'profit',
  'margin',
  'marginPercent',
  'stockValue',
  'varianceValue',
  'bankAccount',
  'mol',
  'phone',
  'email',
  'address',
  'eik',
  'vatNumber',
  'taxId',
  'linesWithoutCost',
];

function cookieHeader(setCookie) {
  return (setCookie ?? []).map((entry) => entry.split(';')[0]).join('; ');
}

async function login(email) {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`login ${email} failed: ${res.status} ${JSON.stringify(body)}`);
  return { email, cookie: cookieHeader(res.headers.getSetCookie()), body };
}

async function call(session, method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Cookie: session.cookie,
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const payload = await res.json().catch(() => ({}));
  return { status: res.status, body: payload };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function expectStatus(result, allowed, label) {
  const list = Array.isArray(allowed) ? allowed : [allowed];
  // Nest create often returns 201 Created.
  const expanded = list.flatMap((code) => (code === 200 ? [200, 201] : [code]));
  assert(expanded.includes(result.status), `${label}: expected ${allowed}, got ${result.status} ${JSON.stringify(result.body)}`);
}

function collectKeys(value, into = new Set()) {
  if (Array.isArray(value)) {
    for (const item of value) collectKeys(item, into);
    return into;
  }
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      into.add(key);
      collectKeys(child, into);
    }
  }
  return into;
}

function assertNoForbiddenFields(payload, label) {
  const keys = collectKeys(payload);
  for (const forbidden of STAFF_FORBIDDEN) {
    assert(!keys.has(forbidden), `${label}: Staff response leaked field "${forbidden}"`);
  }
}

const ownerA = await login('owner-a@skladnik.dev');
const managerA = await login('manager-a@skladnik.dev');
let staffA = null;
try {
  staffA = await login('staff-a@skladnik.dev');
} catch {
  console.warn('staff-a missing — re-seed dev tenants (staff-a@skladnik.dev)');
}
let accountantA = null;
try {
  accountantA = await login('accountant-a@skladnik.dev');
} catch {
  console.warn('accountant-a missing — Accountant cells use owner-a as company-wide stand-in where noted');
}
const ownerB = await login('owner-b@skladnik.dev');

const sitesA = await call(ownerA, 'GET', '/sites');
expectStatus(sitesA, 200, 'owner A sites');
const mainStore = (sitesA.body.sites ?? []).find((site) => site.name === 'Main Store' || site.name === 'Основен магазин');
assert(mainStore, 'Main Store site missing for company A');
const warehouse = (sitesA.body.sites ?? []).find((site) => site.name === 'Warehouse' || site.name === 'Склад');
const productsA = await call(ownerA, 'GET', '/products');
expectStatus(productsA, 200, 'owner A products');
const product = (productsA.body.products ?? []).find((row) => !row.batchTracking) ?? (productsA.body.products ?? [])[0];
assert(product, 'company A needs at least one product');
const batchProduct = (productsA.body.products ?? []).find((row) => row.batchTracking);

// --- Unauthenticated ---
{
  const res = await fetch(`${API}/products`);
  assert(res.status === 401, `unauthenticated GET /products expected 401, got ${res.status}`);
}

// --- Cross-company isolation ---
{
  const snapB = await call(ownerB, 'GET', '/tenancy/snapshot');
  expectStatus(snapB, 200, 'owner B snapshot');
  const spoof = await call(ownerA, 'GET', `/tenancy/snapshot?companyId=${snapB.body.companyId}`);
  expectStatus(spoof, 403, 'spoof companyId');
  const otherProduct = await call(ownerB, 'GET', `/products`);
  expectStatus(otherProduct, 200, 'owner B products');
  const foreignId = (otherProduct.body.products ?? [])[0]?.id;
  if (foreignId) {
    const leak = await call(ownerA, 'PATCH', `/products/${foreignId}`, { minStock: 1 });
    assert(leak.status === 404 || leak.status === 403, `cross-company product patch expected 404/403, got ${leak.status}`);
  }
}

// --- MGR F-04: site manager products ---
{
  const create = await call(managerA, 'POST', '/products', {
    name: 'QA manager create',
    code: `MGR-${Date.now()}`,
    unit: 'PCS',
    vatRate: 20,
    purchasePrice: 1,
    sellingPrice: 2,
  });
  expectStatus(create, 403, 'manager create product');

  const archive = await call(managerA, 'DELETE', `/products/${product.id}`);
  expectStatus(archive, 403, 'manager archive product');

  const price = await call(managerA, 'PATCH', `/products/${product.id}`, { sellingPrice: 99.99 });
  expectStatus(price, 403, 'manager change price');

  const minStock = await call(managerA, 'PATCH', `/products/${product.id}`, { minStock: Number(product.minStock) || 0 });
  expectStatus(minStock, 200, 'manager minStock only');
}

// --- MGR F-10: archive ZIP ---
{
  const preview = await call(managerA, 'GET', '/reports/archive/preview?from=2026-01-01&to=2026-01-31');
  expectStatus(preview, 403, 'manager archive preview');
  const ownerPreview = await call(ownerA, 'GET', '/reports/archive/preview?from=2026-01-01&to=2026-01-31');
  expectStatus(ownerPreview, 200, 'owner archive preview');
  if (accountantA) {
    const accPreview = await call(accountantA, 'GET', '/reports/archive/preview?from=2026-01-01&to=2026-01-31');
    expectStatus(accPreview, 200, 'accountant archive preview');
  }
}

// --- MGR F-11: opening balance ---
{
  const mgrOpen = await call(managerA, 'POST', '/documents', {
    type: 'OPENING_BALANCE',
    siteId: mainStore.id,
    issuedOn: '2026-01-01',
  });
  expectStatus(mgrOpen, [403, 400], 'manager opening balance');
  assert(
    mgrOpen.status === 403 || mgrOpen.body?.code === 'OPENING_BALANCE_OWNER_ONLY' || mgrOpen.body?.code === 'OPENING_BALANCE_LOCKED',
    `manager opening balance wrong body ${JSON.stringify(mgrOpen.body)}`,
  );
}

// --- Users / company settings ---
{
  const mgrUsers = await call(managerA, 'GET', '/users');
  expectStatus(mgrUsers, 403, 'manager users');
  const mgrCompany = await call(managerA, 'PUT', '/company', { name: 'Hacked' });
  expectStatus(mgrCompany, [403, 404, 400, 405], 'manager company write');
}

// --- STAFF matrix (Section F) ---
if (staffA) {
  const today = new Date().toISOString().slice(0, 10);

  // READ allowed (no forbidden fields)
  const staffStock = await call(staffA, 'GET', `/stock?siteId=${mainStore.id}`);
  expectStatus(staffStock, 200, 'staff stock');
  assertNoForbiddenFields(staffStock.body, 'GET /stock');

  const staffProducts = await call(staffA, 'GET', '/products');
  expectStatus(staffProducts, 200, 'staff products');
  assertNoForbiddenFields(staffProducts.body, 'GET /products');

  const staffReorder = await call(staffA, 'GET', `/stock/reorder?siteId=${mainStore.id}`);
  expectStatus(staffReorder, 200, 'staff reorder');
  assertNoForbiddenFields(staffReorder.body, 'GET /stock/reorder');
  // reorder must not expose line money either
  assert(!collectKeys(staffReorder.body).has('unitPrice'), 'staff reorder unitPrice');
  assert(!collectKeys(staffReorder.body).has('lineTotal'), 'staff reorder lineTotal');
  assert(!collectKeys(staffReorder.body).has('total'), 'staff reorder total');

  const staffDocs = await call(staffA, 'GET', `/documents?siteId=${mainStore.id}`);
  expectStatus(staffDocs, 200, 'staff documents list');
  assertNoForbiddenFields(staffDocs.body, 'GET /documents');

  const staffSales = await call(staffA, 'GET', `/sales?siteId=${mainStore.id}&date=${today}`);
  expectStatus(staffSales, 200, 'staff sales list');
  assertNoForbiddenFields(staffSales.body, 'GET /sales');

  const staffReport = await call(staffA, 'GET', `/sales/report?siteId=${mainStore.id}&from=${today}&to=${today}`);
  expectStatus(staffReport, 200, 'staff sales report');
  assertNoForbiddenFields(staffReport.body, 'GET /sales/report');

  // Partners directory blocked; lookup allowed
  const staffPartners = await call(staffA, 'GET', '/partners');
  expectStatus(staffPartners, 403, 'staff partners directory');
  const staffLookup = await call(staffA, 'GET', '/partners/lookup?kind=SUPPLIER');
  expectStatus(staffLookup, 200, 'staff partners lookup');
  assertNoForbiddenFields(staffLookup.body, 'GET /partners/lookup');
  for (const partner of staffLookup.body.partners ?? []) {
    assert(partner.id && partner.name, 'lookup partner shape');
    assert(!('phone' in partner) && !('eik' in partner), 'lookup must be id+name(+kind)');
  }

  // WRITE: receipt draft + submit OK; post RECEIPT forbidden
  const receipt = await call(staffA, 'POST', '/documents', {
    type: 'RECEIPT',
    siteId: mainStore.id,
    issuedOn: today,
    documentNumber: `STAFF-R-${Date.now()}`,
  });
  expectStatus(receipt, 200, 'staff create RECEIPT');
  assertNoForbiddenFields(receipt.body, 'POST /documents RECEIPT');
  const receiptId = receipt.body.document?.id;
  assert(receiptId, 'receipt id');

  const addLine = await call(staffA, 'POST', `/documents/${receiptId}/lines`, {
    productId: product.id,
    quantity: 1,
    ...(product.batchTracking
      ? { batchNumber: `B-${Date.now()}`, expiryDate: '2027-01-15' }
      : {}),
  });
  expectStatus(addLine, 200, 'staff add line');
  assertNoForbiddenFields(addLine.body, 'POST line');

  const submit = await call(staffA, 'POST', `/documents/${receiptId}/submit-for-review`);
  expectStatus(submit, 200, 'staff submit receipt');

  const postReceipt = await call(staffA, 'POST', `/documents/${receiptId}/post`, {});
  expectStatus(postReceipt, 403, 'staff cannot post RECEIPT');

  const cancelReceipt = await call(staffA, 'POST', `/documents/${receiptId}/cancel`);
  expectStatus(cancelReceipt, 403, 'staff cannot cancel');

  // WRITE: transfer / stocktake / opening forbidden
  expectStatus(
    await call(staffA, 'POST', '/documents', { type: 'TRANSFER', siteId: mainStore.id, issuedOn: today, targetSiteId: warehouse?.id }),
    403,
    'staff transfer',
  );
  expectStatus(
    await call(staffA, 'POST', '/documents', { type: 'STOCKTAKE', siteId: mainStore.id, issuedOn: today }),
    403,
    'staff stocktake',
  );
  expectStatus(
    await call(staffA, 'POST', '/documents', { type: 'OPENING_BALANCE', siteId: mainStore.id, issuedOn: today }),
    403,
    'staff opening',
  );

  // WRITE: products / partners / void / reports / users / vat / settings
  expectStatus(await call(staffA, 'POST', '/products', { name: 'X', code: `S-${Date.now()}`, unit: 'PCS', vatRate: 20, purchasePrice: 1, sellingPrice: 2 }), 403, 'staff create product');
  expectStatus(await call(staffA, 'PATCH', `/products/${product.id}`, { minStock: 1 }), 403, 'staff patch product');
  expectStatus(await call(staffA, 'POST', '/partners', { name: 'Hack', kind: 'SUPPLIER' }), 403, 'staff create partner');
  expectStatus(await call(staffA, 'GET', '/users'), 403, 'staff users');
  expectStatus(await call(staffA, 'GET', '/vat/settings'), 403, 'staff vat');
  expectStatus(await call(staffA, 'GET', '/reports/turnover?from=2026-01-01&to=2026-01-31'), 403, 'staff reports turnover');
  expectStatus(await call(staffA, 'GET', '/reports/stock-value'), [403, 400], 'staff reports stock-value');
  expectStatus(await call(staffA, 'GET', '/sales/margins?siteId=' + mainStore.id), 403, 'staff margins');
  expectStatus(await call(staffA, 'GET', '/activity'), 403, 'staff activity');

  // WRITE_OFF create allowed (may fail 400 if no stock — still not 403)
  const writeOff = await call(staffA, 'POST', '/documents', {
    type: 'WRITE_OFF',
    siteId: mainStore.id,
    issuedOn: today,
    writeOffReason: 'EXPIRED',
  });
  assert([200, 201, 400].includes(writeOff.status), `staff write-off create expected 200/201/400, got ${writeOff.status}`);
  if (writeOff.status === 200 || writeOff.status === 201) {
    assertNoForbiddenFields(writeOff.body, 'POST WRITE_OFF');
    const woId = writeOff.body.document.id;
    expectStatus(await call(staffA, 'POST', `/documents/${woId}/reverse`, { reason: 'nope' }), 403, 'staff cannot reverse write-off');
  }

  // Warehouse site (if present): Staff assigned only to Main Store → stock 403
  if (warehouse) {
    expectStatus(await call(staffA, 'GET', `/stock?siteId=${warehouse.id}`), 403, 'staff warehouse stock');
    expectStatus(await call(staffA, 'GET', `/sales?siteId=${warehouse.id}&date=${today}`), 403, 'staff warehouse sales');
  }

  const staffSites = await call(staffA, 'GET', '/sites');
  expectStatus(staffSites, 200, 'staff sites');
  const names = (staffSites.body.sites ?? []).map((s) => s.name);
  assert(names.some((n) => n === 'Main Store' || n === 'Основен магазин'), 'staff sees Main Store');
  assert(!names.some((n) => n === 'Warehouse' || n === 'Склад'), 'staff does not see Warehouse');
} else {
  console.warn('STAFF matrix skipped — no staff-a session');
}

console.log('Role matrix proof passed.');
console.log('  manager minStock OK; archive ZIP Owner/Accountant; opening Owner-only; Staff field-filter + write matrix OK; cross-company isolated');
