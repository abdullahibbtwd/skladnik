const API = process.env.API_URL ?? 'http://localhost:3003';
const PASSWORD = 'DevPassword123!';

function cookieHeader(setCookie) {
  return setCookie.map((entry) => entry.split(';')[0]).join('; ');
}

async function login(email) {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(`login ${email} failed: ${res.status} ${JSON.stringify(body)}`);
  }
  return { body, cookie: cookieHeader(res.headers.getSetCookie()) };
}

async function getJson(path, cookie, query = '') {
  const res = await fetch(`${API}${path}${query}`, {
    headers: { Cookie: cookie },
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const ownerA = await login('owner-a@skladnik.dev');
const managerA = await login('manager-a@skladnik.dev');
const ownerB = await login('owner-b@skladnik.dev');

const snapA = await getJson('/tenancy/snapshot', ownerA.cookie);
const snapB = await getJson('/tenancy/snapshot', ownerB.cookie);
const snapMgr = await getJson('/tenancy/snapshot', managerA.cookie);

assert(snapA.status === 200, `owner A snapshot ${snapA.status}`);
assert(snapB.status === 200, `owner B snapshot ${snapB.status}`);
assert(snapA.body.companyName === 'Metro Corner Market', `unexpected A company ${snapA.body.companyName}`);
assert(snapB.body.companyName === 'Riverside Cafe', `unexpected B company ${snapB.body.companyName}`);
assert(snapA.body.companyId !== snapB.body.companyId, 'both owners resolved to the same company');
assert(snapMgr.body.companyId === snapA.body.companyId, 'manager is not scoped to company A');
assert(snapA.body.userCount >= 2, 'company A should have owner + manager');
assert(snapB.body.userCount === 1, 'company B should not see company A users');

const spoof = await getJson('/tenancy/snapshot', ownerA.cookie, `?companyId=${snapB.body.companyId}`);
assert(spoof.status === 403, `expected 403 when spoofing companyId, got ${spoof.status}`);

const sitesA = await getJson('/tenancy/sites', ownerA.cookie);
const sitesMgr = await getJson('/tenancy/sites', managerA.cookie);
assert(sitesA.body.sites.length === 2, `owner A should see 2 sites, got ${sitesA.body.sites.length}`);
assert(sitesMgr.body.sites.length === 1, `manager should see 1 site, got ${sitesMgr.body.sites.length}`);
assert(sitesMgr.body.sites[0].name === 'Main Store', 'manager saw the wrong site');

const warehouse = sitesA.body.sites.find((site) => site.name === 'Warehouse');
const mgrWarehouse = await getJson(`/tenancy/sites/${warehouse.id}`, managerA.cookie);
assert(mgrWarehouse.status === 403, `manager reached warehouse: ${mgrWarehouse.status}`);

const ownerOnlyMgr = await getJson('/tenancy/owner-only', managerA.cookie);
const ownerOnlyA = await getJson('/tenancy/owner-only', ownerA.cookie);
assert(ownerOnlyMgr.status === 403, 'site manager passed the owner-only guard');
assert(ownerOnlyA.status === 200, 'owner failed the owner-only guard');

const me = await getJson('/auth/me', ownerA.cookie);
assert(me.body.user?.email === 'owner-a@skladnik.dev', 'GET /auth/me did not return the cookie session');

function rowIds(body, key) {
  const rows = body?.[key];
  return Array.isArray(rows) ? rows.map((row) => row.id).filter(Boolean) : [];
}

const productsA = await getJson('/products', ownerA.cookie);
const productsB = await getJson('/products', ownerB.cookie);
assert(productsA.status === 200 && productsB.status === 200, 'product lists');
const idsA = rowIds(productsA.body, 'products');
const idsB = rowIds(productsB.body, 'products');
assert(idsB.length > 0, 'company B has products');
assert(idsA.every((id) => !idsB.includes(id)), 'product lists overlap companies');
const foreignProduct = await getJson(`/products/${idsB[0]}`, ownerA.cookie);
assert(foreignProduct.status === 404, `foreign product expected 404, got ${foreignProduct.status}`);
const foreignBatch = await fetch(`${API}/products/${idsB[0]}/enable-batch-tracking`, {
  method: 'POST',
  headers: { Cookie: ownerA.cookie },
});
assert(foreignBatch.status === 404, `foreign enable-batch expected 404, got ${foreignBatch.status}`);
const foreignMerge = await fetch(`${API}/products/${idsB[0]}/merge`, {
  method: 'POST',
  headers: { Cookie: ownerA.cookie, 'Content-Type': 'application/json' },
  body: JSON.stringify({ productId: idsA[0] ?? idsB[0] }),
});
assert(foreignMerge.status === 404, `foreign merge expected 404, got ${foreignMerge.status}`);

const pendingA = await getJson('/products?status=PENDING_REVIEW', ownerA.cookie);
const pendingB = await getJson('/products?status=PENDING_REVIEW', ownerB.cookie);
assert(pendingA.status === 200 && pendingB.status === 200, 'pending product lists');
assert(
  rowIds(pendingA.body, 'products').every((id) => !rowIds(pendingB.body, 'products').includes(id)),
  'pending product lists overlap companies',
);

const partnersA = await getJson('/partners', ownerA.cookie);
const partnersB = await getJson('/partners', ownerB.cookie);
assert(partnersA.status === 200 && partnersB.status === 200, 'partner lists');
const partnerIdsB = rowIds(partnersB.body, 'partners');
assert(partnerIdsB.length > 0, 'company B has partners');
assert(rowIds(partnersA.body, 'partners').every((id) => !partnerIdsB.includes(id)), 'partner lists overlap');
const foreignPartner = await getJson(`/partners/${partnerIdsB[0]}`, ownerA.cookie);
assert(foreignPartner.status === 404, `foreign partner expected 404, got ${foreignPartner.status}`);

const siteB = (await getJson('/tenancy/sites', ownerB.cookie)).body.sites[0];
const foreignStock = await getJson(`/stock?siteId=${siteB.id}`, ownerA.cookie);
assert(foreignStock.status === 403, `foreign stock expected 403, got ${foreignStock.status}`);
assert(
  /outside your company|извън вашата фирма|обект/i.test(JSON.stringify(foreignStock.body)),
  `foreign stock message ${JSON.stringify(foreignStock.body)}`,
);
const foreignSales = await getJson(`/sales?siteId=${siteB.id}&date=2026-10-02`, ownerA.cookie);
assert(foreignSales.status === 403, `foreign sales expected 403, got ${foreignSales.status}`);
const foreignRecipes = await getJson(`/recipes?siteId=${siteB.id}`, ownerA.cookie);
assert(foreignRecipes.status === 403, `foreign recipes expected 403, got ${foreignRecipes.status}`);
const ownSites = await getJson('/sites', ownerA.cookie);
assert(ownSites.status === 200, 'own sites');
assert(
  (ownSites.body.sites ?? []).every((site) => site.companyId === undefined || site.companyId === snapA.body.companyId),
  'sites payload includes another company',
);
assert(!(ownSites.body.sites ?? []).some((site) => site.id === siteB.id), 'sites list includes the other company site');

const docsB = await getJson('/documents', ownerB.cookie);
assert(docsB.status === 200, 'company B documents');
const docB = (docsB.body.documents ?? [])[0];
if (docB) {
  const foreignDoc = await getJson(`/documents/${docB.id}`, ownerA.cookie);
  assert(foreignDoc.status === 404, `foreign document expected 404, got ${foreignDoc.status}`);
  const foreignSubmit = await fetch(`${API}/documents/${docB.id}/submit-for-review`, {
    method: 'POST',
    headers: { Cookie: ownerA.cookie },
  });
  assert(foreignSubmit.status === 404, `foreign submit expected 404, got ${foreignSubmit.status}`);
  const detailB = await getJson(`/documents/${docB.id}`, ownerB.cookie);
  const capture = (detailB.body.document?.captures ?? detailB.body.captures ?? [])[0];
  if (capture?.id) {
    const foreignFile = await getJson(`/documents/${docB.id}/captures/${capture.id}/file`, ownerA.cookie);
    assert(foreignFile.status === 404, `foreign photo expected 404, got ${foreignFile.status}`);
  }
}

const activityA = await getJson('/activity', ownerA.cookie);
const activityB = await getJson('/activity', ownerB.cookie);
assert(activityA.status === 200 && activityB.status === 200, 'activity logs');
const activityIdsB = rowIds(activityB.body, 'entries');
assert(rowIds(activityA.body, 'entries').every((id) => !activityIdsB.includes(id)), 'activity logs overlap companies');

console.log('Isolation proof passed.');
console.log(`  A: ${snapA.body.companyName} users=${snapA.body.userCount} sites=${snapA.body.siteCount}`);
console.log(`  B: ${snapB.body.companyName} users=${snapB.body.userCount} sites=${snapB.body.siteCount}`);
console.log(`  manager A sites: ${sitesMgr.body.sites.map((site) => site.name).join(', ')}`);
