const API = process.env.API_URL ?? 'http://localhost:3003';
const EMAIL = process.env.RESET_EMAIL ?? 'owner-a@skladnik.dev';
const OLD_PASSWORD = process.env.SEED_PASSWORD ?? 'DevPassword123!';
const NEW_PASSWORD = 'ResetProof456!';

function cookieHeader(setCookie) {
  return setCookie.map((entry) => entry.split(';')[0]).join('; ');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function login(email, password) {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body, cookie: cookieHeader(res.headers.getSetCookie?.() ?? []) };
}

async function post(path, body) {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = await res.json().catch(() => ({}));
  return { status: res.status, body: payload, cookie: cookieHeader(res.headers.getSetCookie?.() ?? []) };
}

const providers = await fetch(`${API}/auth/providers`).then((r) => r.json());
assert('googleClientId' in providers, 'GET /auth/providers missing googleClientId');

const before = await login(EMAIL, OLD_PASSWORD);
assert(before.status === 200 || before.status === 201, `login with old password failed: ${before.status}`);

const forgotUnknown = await post('/auth/forgot-password', { email: 'nobody-does-not-exist@skladnik.dev' });
assert(forgotUnknown.status === 201 || forgotUnknown.status === 200, `forgot unknown status ${forgotUnknown.status}`);
assert(forgotUnknown.body.ok === true, 'forgot unknown must return ok');
assert(!forgotUnknown.body.resetUrl, 'unknown email must not leak a reset URL');

const forgot = await post('/auth/forgot-password', { email: EMAIL });
assert(forgot.status === 201 || forgot.status === 200, `forgot status ${forgot.status}`);
assert(forgot.body.ok === true, 'forgot must return ok');
assert(typeof forgot.body.resetUrl === 'string' && forgot.body.resetUrl.includes('token='), 'dev resetUrl missing (is NODE_ENV=production?)');

const token = new URL(forgot.body.resetUrl).searchParams.get('token');
assert(token && token.length >= 20, 'reset token missing from URL');

const badToken = await post('/auth/reset-password', { token: 'x'.repeat(32), password: NEW_PASSWORD });
assert(badToken.status === 400, `bad token should 400, got ${badToken.status}`);

const reset = await post('/auth/reset-password', { token, password: NEW_PASSWORD });
assert(reset.status === 201 || reset.status === 200, `reset status ${reset.status}`);
assert(reset.body.ok === true, 'reset must return ok');

const oldLogin = await login(EMAIL, OLD_PASSWORD);
assert(oldLogin.status === 401, `old password should fail after reset, got ${oldLogin.status}`);

const fresh = await login(EMAIL, NEW_PASSWORD);
assert(fresh.status === 200 || fresh.status === 201, `login with new password failed: ${fresh.status}`);

// Restore the seeded password so other prove scripts keep working.
const restoreForgot = await post('/auth/forgot-password', { email: EMAIL });
const restoreToken = new URL(restoreForgot.body.resetUrl).searchParams.get('token');
const restore = await post('/auth/reset-password', { token: restoreToken, password: OLD_PASSWORD });
assert(restore.body.ok === true, 'could not restore seeded password');

console.log('Password reset proof passed.');
console.log(`  providers.googleClientId: ${providers.googleClientId ? 'set' : 'null'}`);
console.log(`  reset + re-login ok for ${EMAIL}`);
