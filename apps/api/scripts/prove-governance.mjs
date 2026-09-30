// Checks company settings, numbering series, tax-ID validation, till price rules and the activity log
// against a running API with the demo data. Writes a write-off, two partners and a sale; restores the
// company profile and price roles it changes.
const API = process.env.API_URL ?? 'http://localhost:3003';
const PASSWORD = process.env.DEMO_PASSWORD ?? 'DevPassword123!';

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

/** A random ЕИК with a valid checksum, so repeated runs don't collide. */
function randomEik() {
  const digits = Array.from({ length: 8 }, () => Math.floor(Math.random() * 10));
  let check = digits.reduce((sum, digit, index) => sum + digit * (index + 1), 0) % 11;
  if (check === 10) check = digits.reduce((sum, digit, index) => sum + digit * (index + 3), 0) % 11 % 10;
  return `${digits.join('')}${check}`;
}

const ok = (res, label) => assert(res.status >= 200 && res.status < 300, `${label}: ${res.status} ${JSON.stringify(res.body)}`);

const owner = await login('demo-owner@skladnik.dev');
const cashier = await login('demo-cashier@skladnik.dev');
const manager = await login('demo-manager@skladnik.dev');
const stamp = Date.now();

// Company tab
const settings = await call(owner, 'GET', '/company');
ok(settings, 'company settings');
const original = settings.body;
assert(original.series.some((row) => row.key === 'WRITE_OFF'), 'write-off series listed');
ok(await call(cashier, 'GET', '/company'), 'staff can read company settings');
assert((await call(cashier, 'PUT', '/company/profile', { ...original.profile })).status === 403, 'staff cannot edit the profile');

const badProfile = await call(owner, 'PUT', '/company/profile', { ...original.profile, eik: '204512873', vatNumber: 'BG204512873' });
assert(badProfile.status === 400, `bad ЕИК accepted: ${badProfile.status}`);
const mismatch = await call(owner, 'PUT', '/company/profile', { ...original.profile, eik: '206400170', vatNumber: 'BG204512879' });
assert(mismatch.status === 400, `VAT number of another company accepted: ${mismatch.status}`);
const saved = await call(owner, 'PUT', '/company/profile', {
  ...original.profile,
  eik: '206400170',
  vatNumber: '206400170',
  address: `ул. Проверка ${stamp}`,
});
ok(saved, 'save profile');
assert(saved.body.profile.vatNumber === 'BG206400170', `VAT number not normalised: ${saved.body.profile.vatNumber}`);
console.log('✓ company profile: checksum enforced, VAT number normalised, staff read-only');

assert((await call(owner, 'PUT', '/company/expiry-windows', { windows: [30, 30, 7, 3] })).status === 400, 'non-descending windows accepted');
const windows = await call(owner, 'PUT', '/company/expiry-windows', { windows: [45, 20, 10, 2] });
ok(windows, 'save expiry windows');
ok(await call(owner, 'PUT', '/company/expiry-windows', { windows: original.expiryWindows }), 'restore expiry windows');
console.log('✓ expiry thresholds validated and saved');

// Write-off numbering
const sites = await call(owner, 'GET', '/sites');
const site = sites.body.sites.find((row) => row.isActive);
const series = original.series.find((row) => row.key === 'WRITE_OFF');
const writeOff = await call(owner, 'POST', '/documents', {
  type: 'WRITE_OFF',
  siteId: site.id,
  issuedOn: new Date().toISOString().slice(0, 10),
  writeOffReason: 'DAMAGED',
});
ok(writeOff, 'create write-off');
const writeOffDoc = writeOff.body.document;
assert(writeOffDoc.type === 'WRITE_OFF', `write-off type ${writeOffDoc.type}`);
assert(/^ПБ-\d{4,}$/.test(writeOffDoc.documentNumber), `write-off number ${writeOffDoc.documentNumber}`);
assert(writeOffDoc.documentNumber >= series.preview, `write-off ${writeOffDoc.documentNumber} before series preview ${series.preview}`);
const noReason = await call(owner, 'POST', '/documents', { type: 'WRITE_OFF', siteId: site.id, issuedOn: '2026-09-01' });
assert(noReason.status === 400, `write-off without reason: ${noReason.status}`);
const invoiceNoNumber = await call(owner, 'POST', '/documents', { type: 'INVOICE', siteId: site.id, issuedOn: '2026-09-01' });
assert(invoiceNoNumber.status === 400, `invoice without its printed number: ${invoiceNoNumber.status}`);
console.log(`✓ write-off numbered ${writeOffDoc.documentNumber} from its series, typed WRITE_OFF`);
await call(owner, 'POST', `/documents/${writeOffDoc.id}/cancel`);

// Partners
const badPartner = await call(owner, 'POST', '/partners', { name: `Bad IDs ${stamp}`, kind: 'SUPPLIER', vatNumber: 'BG204512873' });
assert(badPartner.status === 400, `invalid VAT number accepted: ${badPartner.status}`);
const eik = randomEik();
const partner = await call(owner, 'POST', '/partners', { name: `Good IDs ${stamp}`, kind: 'SUPPLIER', eik, vatNumber: `bg ${eik}` });
ok(partner, 'partner with valid IDs');
assert(partner.body.partner.eik === eik && partner.body.partner.vatNumber === `BG${eik}`, `partner IDs ${JSON.stringify(partner.body.partner)}`);
console.log('✓ partner ЕИК and VAT number checked on save');

// Till prices
const stock = await call(owner, 'GET', `/stock?siteId=${site.id}`);
const item = stock.body.items.find((row) => !row.batchTracking && row.onHand >= 3 && row.purchasePrice > 0 && row.sellingPrice > 0);
assert(item, 'no stocked product with a cost to sell');
const sale = (unitPrice, extra = {}) => ({
  siteId: site.id,
  paymentMethod: 'CASH',
  clientRequestId: crypto.randomUUID(),
  items: [{ productId: item.productId, quantity: 1, unitPrice }],
  ...extra,
});
const cheap = 0.01;
const forbidden = await call(cashier, 'POST', '/sales', sale(cheap));
assert(forbidden.status === 403, `cashier changed a price: ${forbidden.status}`);
const warned = await call(manager, 'POST', '/sales', sale(cheap));
assert(warned.status === 400 && warned.body.code === 'BELOW_COST_CONFIRM', `below cost not warned: ${warned.status} ${JSON.stringify(warned.body)}`);
const confirmed = await call(manager, 'POST', '/sales', sale(cheap, { confirmBelowCost: true }));
ok(confirmed, 'confirmed below-cost sale');
const saleId = confirmed.body.id ?? confirmed.body.sale?.id;

ok(await call(owner, 'PUT', '/company/price-override-roles', { roles: ['OWNER'] }), 'restrict price changes');
const managerBlocked = await call(manager, 'POST', '/sales', sale(item.sellingPrice + 1));
assert(managerBlocked.status === 403, `manager changed a price after roles were restricted: ${managerBlocked.status}`);
assert((await call(manager, 'PUT', '/company/price-override-roles', { roles: ['OWNER', 'STAFF'] })).status === 403, 'manager edited price roles');
ok(await call(owner, 'PUT', '/company/price-override-roles', { roles: original.priceOverrideRoles }), 'restore price roles');
console.log(`✓ till: staff blocked, below-cost warned then confirmed, roles configurable (${item.name})`);

// Activity log
const priceLog = await call(owner, 'GET', `/activity?action=PRICE_OVERRIDE&limit=5`);
ok(priceLog, 'activity list');
const override = priceLog.body.entries.find((entry) => !saleId || entry.entityId === saleId);
assert(override, 'price override not logged');
assert(override.before.unitPrice === item.sellingPrice && override.after.unitPrice === cheap, `override values ${JSON.stringify(override)}`);
assert(override.user?.name, 'override without a user');
const docLog = await call(owner, 'GET', `/activity?entityId=${writeOffDoc.id}`);
const actions = docLog.body.entries.map((entry) => entry.action);
assert(actions.includes('CREATE') && actions.includes('CANCEL'), `write-off history ${actions}`);
const profileLog = await call(owner, 'GET', `/activity?entityType=Company&limit=5`);
assert(profileLog.body.entries.some((entry) => entry.after?.address === `ул. Проверка ${stamp}`), 'profile change not logged with its new value');
assert((await call(cashier, 'GET', '/activity')).status === 403, 'staff can read the activity log');
console.log('✓ activity log: price override before/after, document history, profile diff; staff blocked');

ok(await call(owner, 'PUT', '/company/profile', { ...original.profile }), 'restore profile');
console.log('\nGovernance checks passed.');
