/**
 * Unit checks for resolveEntitlement (read-only after expiry, export still allowed).
 */
import assert from 'node:assert/strict';
import { resolveEntitlement, type EntitlementInput } from '@skladnik/shared';

const now = new Date('2026-10-06T12:00:00.000Z');

function check(input: EntitlementInput, expect: { access: string; reason: string | null; canWrite: boolean; canExport: boolean }) {
  const result = resolveEntitlement(input, now);
  assert.equal(result.access, expect.access, `access for ${JSON.stringify(input)}`);
  assert.equal(result.reason, expect.reason, `reason for ${JSON.stringify(input)}`);
  assert.equal(result.canWrite, expect.canWrite);
  assert.equal(result.canExport, expect.canExport);
}

check(null, { access: 'read_only', reason: 'NO_SUBSCRIPTION', canWrite: false, canExport: true });

check(
  { status: 'ACTIVE', expiresAt: new Date('2027-01-01T00:00:00.000Z') },
  { access: 'full', reason: null, canWrite: true, canExport: true },
);
check(
  { status: 'TRIAL', expiresAt: new Date('2026-10-20T00:00:00.000Z') },
  { access: 'full', reason: null, canWrite: true, canExport: true },
);

check(
  { status: 'ACTIVE', expiresAt: new Date('2026-10-01T00:00:00.000Z') },
  { access: 'read_only', reason: 'EXPIRED', canWrite: false, canExport: true },
);
check(
  { status: 'EXPIRED', expiresAt: new Date('2026-09-01T00:00:00.000Z') },
  { access: 'read_only', reason: 'EXPIRED', canWrite: false, canExport: true },
);
check(
  { status: 'SUSPENDED', expiresAt: new Date('2027-01-01T00:00:00.000Z') },
  { access: 'read_only', reason: 'SUSPENDED', canWrite: false, canExport: true },
);
check(
  { status: 'REVOKED', expiresAt: null },
  { access: 'none', reason: 'REVOKED', canWrite: false, canExport: false },
);

console.log('resolve-entitlement.test.ts: ok');
