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

console.log('Isolation proof passed.');
console.log(`  A: ${snapA.body.companyName} users=${snapA.body.userCount} sites=${snapA.body.siteCount}`);
console.log(`  B: ${snapB.body.companyName} users=${snapB.body.userCount} sites=${snapB.body.siteCount}`);
console.log(`  manager A sites: ${sitesMgr.body.sites.map((site) => site.name).join(', ')}`);
