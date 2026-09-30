// Audit F-03 / F-16 end to end against a running API with the demo seed:
// scan the clean Млечен път invoice № 0000777001, poll the document the way the review screen does,
// and check that every line landed on an existing product and no product was made up.
//
//   API_URL=http://localhost:3003 node scripts/prove-scan-matching.mjs path/to/invoice.jpg \
//     [--expect=M-001,M-005,M-002] [--keep]
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

const API = process.env.API_URL ?? 'http://localhost:3003';
const PASSWORD = process.env.DEMO_PASSWORD ?? 'DevPassword123!';
const POLL_MS = 3000;
const GIVE_UP_MS = 5 * 60_000;

const [file, ...rest] = process.argv.slice(2);
const args = Object.fromEntries(rest.map((arg) => arg.replace(/^--/, '').split('=')).map(([key, value]) => [key, value ?? true]));
if (!file) {
  console.error('Usage: node scripts/prove-scan-matching.mjs invoice.jpg [--expect=M-001,M-005,M-002] [--keep]');
  process.exit(1);
}
const expected = String(args.expect ?? 'M-001,M-005,M-002').split(',');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const login = await fetch(`${API}/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'demo-owner@skladnik.dev', password: PASSWORD }),
});
assert(login.ok, `login failed ${login.status}`);
const cookie = login.headers.getSetCookie().map((entry) => entry.split(';')[0]).join('; ');

async function api(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { Cookie: cookie, ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}) },
    body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
  });
  const payload = await res.json().catch(() => ({}));
  assert(res.ok, `${method} ${path} → ${res.status} ${JSON.stringify(payload)}`);
  return payload;
}

const pendingBefore = (await api('GET', '/products?status=PENDING_REVIEW')).products.length;
const site = (await api('GET', '/sites')).sites.find((row) => row.isActive);

const form = new FormData();
form.append('clientRequestId', crypto.randomUUID());
form.append('siteId', site.id);
form.append('type', 'INVOICE');
form.append('issuedOn', new Date().toISOString().slice(0, 10));
form.append('capturedAt', new Date().toISOString());
form.append('file', new Blob([readFileSync(file)], { type: 'image/jpeg' }), basename(file));
const startedAt = Date.now();
let { document } = await api('POST', '/documents/scan', form);
console.log(`Scanned ${basename(file)} → document ${document.id}; reading: ${document.extraction.reading}`);

while (document.extraction.reading) {
  assert(Date.now() - startedAt < GIVE_UP_MS, 'still reading after 5 minutes');
  await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  ({ document } = await api('GET', `/documents/${document.id}`));
}
const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
const failed = document.captures.find((capture) => capture.extractionFailed);
assert(!failed, `reading failed after ${seconds}s: ${failed?.extractionError}`);
console.log(`Read in ${seconds}s (upload to lines on screen, polled every ${POLL_MS / 1000}s)`);

for (const line of document.lines) {
  console.log(
    `  ${line.position + 1}. ${line.product ? `${line.product.code} ${line.product.name} [${line.product.status}]` : 'UNMATCHED'}` +
      `  ← "${line.printed.description}"  batch ${line.batchNumber ?? '—'}, expiry ${line.expiryDate ?? '—'}` +
      (line.product ? '' : `  suggestions: ${line.suggestions.map((row) => row.code).join(', ') || '—'}`),
  );
}
const pendingAfter = (await api('GET', '/products?status=PENDING_REVIEW')).products.length;
console.log(`Pending-review products: ${pendingBefore} before, ${pendingAfter} after`);

const codes = document.lines.map((line) => line.product?.code ?? null);
assert(pendingAfter === pendingBefore, 'the scan created products');
assert(codes.length === expected.length, `expected ${expected.length} lines, got ${codes.length}`);
for (const code of expected) assert(codes.includes(code), `no line matched ${code}`);
assert(document.lines.every((line) => line.product?.status === 'ACTIVE'), 'a line is on a non-active product');
console.log('OK: every line matched an existing product.');

if (!args.keep) {
  await api('POST', `/documents/${document.id}/cancel`);
  console.log('Draft cancelled.');
}
