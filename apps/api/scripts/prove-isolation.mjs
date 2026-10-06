import { createHmac, randomBytes } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

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

// --- Subscriptions: tenant isolation + activation ---
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const CHECK = `${CROCKFORD}*`;
const PEPPER = process.env.ACTIVATION_CODE_PEPPER ?? 'dev-activation-code-pepper-change-me';

function encodeCrockford(bytes) {
  let bits = '';
  for (const byte of bytes) bits += byte.toString(2).padStart(8, '0');
  while (bits.length % 5 !== 0) bits += '0';
  let out = '';
  for (let i = 0; i < bits.length; i += 5) out += CROCKFORD[parseInt(bits.slice(i, i + 5), 2)];
  return out;
}

function crockfordChecksum(payload) {
  let sum = 0;
  for (const ch of payload) sum = (sum * 32 + CROCKFORD.indexOf(ch)) % 37;
  return CHECK[sum];
}

function issueCode() {
  const payload = encodeCrockford(randomBytes(16));
  const normalized = `${payload}${crockfordChecksum(payload)}`;
  const parts = [];
  for (let i = 0; i < normalized.length; i += 4) parts.push(normalized.slice(i, i + 4));
  return {
    plaintext: parts.join('-'),
    normalized,
    codeHash: createHmac('sha256', PEPPER).update(normalized, 'utf8').digest('hex'),
    codePrefix: normalized.slice(0, 5),
  };
}

async function postJson(path, cookie, body) {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, body: json };
}

const subA = await getJson('/subscriptions/current', ownerA.cookie);
const subB = await getJson('/subscriptions/current', ownerB.cookie);
assert(subA.status === 200 && subB.status === 200, 'subscription current');
assert(subA.body.subscription, 'company A should have a live subscription (trial/grandfather)');
assert(subB.body.subscription, 'company B should have a live subscription');
assert(
  subA.body.subscription.id !== subB.body.subscription.id,
  'subscription current leaked across tenants',
);

const prisma = new PrismaClient();
const issued = issueCode();
let pendingSubId = null;
try {
  const pending = await prisma.subscription.create({
    data: {
      plan: 'PRO',
      status: 'PENDING',
      maxUsers: 10,
      termMonths: 12,
      companyNameHint: 'prove-isolation',
      activationCodes: {
        create: {
          codeHash: issued.codeHash,
          codePrefix: issued.codePrefix,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      },
    },
  });
  pendingSubId = pending.id;

  const badActivate = await postJson('/subscriptions/activate', ownerA.cookie, { code: 'AAAA-AAAA-AAAA' });
  assert(badActivate.status === 400, `malformed activate expected 400, got ${badActivate.status}`);
  assert(badActivate.body.code === 'ACTIVATION_FAILED', 'activate should use ACTIVATION_FAILED');

  const managerActivate = await postJson('/subscriptions/activate', managerA.cookie, {
    code: issued.plaintext,
  });
  assert(managerActivate.status === 403, `manager activate expected 403, got ${managerActivate.status}`);

  const activateA = await postJson('/subscriptions/activate', ownerA.cookie, { code: issued.plaintext });
  assert(activateA.status === 200, `owner A activate failed: ${activateA.status} ${JSON.stringify(activateA.body)}`);
  assert(activateA.body.subscription?.status === 'ACTIVE', 'activated status');
  assert(activateA.body.subscription?.plan === 'PRO', 'activated plan');

  const reuse = await postJson('/subscriptions/activate', ownerB.cookie, { code: issued.plaintext });
  assert(reuse.status === 400, `owner B re-use expected 400, got ${reuse.status}`);

  const afterA = await getJson('/subscriptions/current', ownerA.cookie);
  const afterB = await getJson('/subscriptions/current', ownerB.cookie);
  assert(afterA.status === 200 && afterB.status === 200, 'subscription current after activate');
  assert(afterA.body.subscription?.id !== afterB.body.subscription?.id, 'post-activate tenant isolation');
  assert(afterA.body.subscription?.plan === 'PRO', 'owner A current shows activated plan');
  assert(afterA.body.subscription?.status === 'ACTIVE', 'owner A current shows ACTIVE');
} finally {
  await prisma.$executeRawUnsafe(`ALTER TABLE "SubscriptionEvent" DISABLE TRIGGER "SubscriptionEvent_append_only"`);
  try {
    if (pendingSubId) {
      await prisma.subscriptionEvent.deleteMany({ where: { subscriptionId: pendingSubId } });
      await prisma.activationCode.deleteMany({ where: { subscriptionId: pendingSubId } });
      await prisma.subscription.deleteMany({ where: { id: pendingSubId } });
    }
    const leftovers = await prisma.subscription.findMany({
      where: { companyNameHint: 'prove-isolation' },
      select: { id: true },
    });
    for (const row of leftovers) {
      await prisma.subscriptionEvent.deleteMany({ where: { subscriptionId: row.id } });
      await prisma.activationCode.deleteMany({ where: { subscriptionId: row.id } });
      await prisma.subscription.deleteMany({ where: { id: row.id } });
    }
    // Activation revokes the previous live row; restore a grandfather so the seed stays usable.
    const liveA = await prisma.subscription.count({
      where: {
        companyId: snapA.body.companyId,
        status: { in: ['TRIAL', 'ACTIVE', 'GRANDFATHERED', 'EXPIRED', 'SUSPENDED'] },
      },
    });
    if (liveA === 0) {
      await prisma.subscription.create({
        data: {
          companyId: snapA.body.companyId,
          plan: 'MULTI_LOCATION',
          status: 'GRANDFATHERED',
          maxUsers: 100,
          termMonths: 12,
          startsAt: new Date(),
          expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
          notes: 'Restored after auth:prove activation check',
        },
      });
    }
  } finally {
    await prisma.$executeRawUnsafe(`ALTER TABLE "SubscriptionEvent" ENABLE TRIGGER "SubscriptionEvent_append_only"`);
    await prisma.$disconnect();
  }
}

console.log('Isolation proof passed.');
console.log(`  A: ${snapA.body.companyName} users=${snapA.body.userCount} sites=${snapA.body.siteCount}`);
console.log(`  B: ${snapB.body.companyName} users=${snapB.body.userCount} sites=${snapB.body.siteCount}`);
console.log(`  manager A sites: ${sitesMgr.body.sites.map((site) => site.name).join(', ')}`);
console.log('  subscriptions: tenant isolation + activation covered');
