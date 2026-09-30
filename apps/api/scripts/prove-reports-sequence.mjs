/**
 * Report sequence smoke (Group 8 / MGR F-01). Logs in as manager and owner, walks the
 * same report kinds QA froze on, aborts mid-flight once, and fails if any call exceeds budget.
 *
 *   API_URL=http://localhost:3003 SEED_PASSWORD='…' node scripts/prove-reports-sequence.mjs
 */
const API = process.env.API_URL ?? 'http://localhost:3003';
const PASSWORD = process.env.SEED_PASSWORD ?? 'DevPassword123!';
const BUDGET_MS = Number(process.env.REPORT_BUDGET_MS ?? 15_000);

const KINDS = [
  'turnover',
  'stock-value',
  'batches',
  'movements',
  'write-offs',
  'stocktake-variances',
  'vat-summary',
  'vat-journal',
  'top-products',
  'slow-movers',
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
  if (!res.ok) throw new Error(`login ${email}: ${res.status}`);
  return cookieHeader(res.headers.getSetCookie());
}

async function timedGet(cookie, path, { signal, label } = {}) {
  const started = Date.now();
  const res = await fetch(`${API}${path}`, { headers: { Cookie: cookie }, signal });
  const ms = Date.now() - started;
  if (ms > BUDGET_MS) throw new Error(`${label ?? path} took ${ms}ms (budget ${BUDGET_MS}ms)`);
  return { status: res.status, ms };
}

const from = '2026-01-01';
const to = '2026-01-31';
const qs = `from=${from}&to=${to}`;

async function walk(email) {
  const cookie = await login(email);
  let requests = 0;
  for (const kind of KINDS) {
    const path = `/reports/${kind}?${qs}`;
    // Manager has no VAT? Still hits 403 quickly — that is fine; freeze was about hangs.
    const result = await timedGet(cookie, path, { label: `${email} ${kind}` });
    requests += 1;
    if (![200, 403].includes(result.status)) {
      throw new Error(`${email} ${kind}: unexpected ${result.status}`);
    }
  }

  // Abort mid-flight: start a report then cancel; must not hang the next call.
  const controller = new AbortController();
  const pending = timedGet(cookie, `/reports/turnover?${qs}`, { signal: controller.signal, label: 'aborted' }).catch(
    (error) => error,
  );
  controller.abort();
  await pending;
  const after = await timedGet(cookie, `/reports/stock-value?${qs}`, { label: `${email} after-abort` });
  if (after.status !== 200 && after.status !== 403) throw new Error(`after abort: ${after.status}`);
  requests += 2;
  return requests;
}

const managerEmail = process.env.MANAGER_EMAIL ?? 'demo-manager@skladnik.dev';
const ownerEmail = process.env.OWNER_EMAIL ?? 'demo-owner@skladnik.dev';

let managerRequests = 0;
let ownerRequests = 0;
try {
  managerRequests = await walk(managerEmail);
} catch (error) {
  // Fall back to dual-tenant manager if demo seed is absent.
  if (String(error.message).includes('login')) {
    managerRequests = await walk('manager-a@skladnik.dev');
  } else throw error;
}
try {
  ownerRequests = await walk(ownerEmail);
} catch (error) {
  if (String(error.message).includes('login')) {
    ownerRequests = await walk('owner-a@skladnik.dev');
  } else throw error;
}

console.log('Report sequence proof passed.');
console.log(`  manager requests≈${managerRequests}, owner requests≈${ownerRequests}, budget=${BUDGET_MS}ms/call`);
