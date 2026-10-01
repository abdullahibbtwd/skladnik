import assert from 'node:assert/strict';
import { isAccountantMutationAllowed, normalizeRequestPath } from './accountant-allowlist';

assert.equal(normalizeRequestPath('/vat/periods/2026-09/filings?x=1'), '/vat/periods/2026-09/filings');
assert.equal(normalizeRequestPath('/export-profiles/'), '/export-profiles');

assert.equal(isAccountantMutationAllowed('GET', '/documents'), true);
assert.equal(isAccountantMutationAllowed('HEAD', '/reports/turnover'), true);

assert.equal(isAccountantMutationAllowed('POST', '/export-profiles'), true);
assert.equal(isAccountantMutationAllowed('PUT', '/export-profiles/abc'), true);
assert.equal(isAccountantMutationAllowed('DELETE', '/export-profiles/abc'), true);

assert.equal(isAccountantMutationAllowed('PUT', '/vat/periods/2026-09/inputs'), true);
assert.equal(isAccountantMutationAllowed('POST', '/vat/periods/2026-09/filings'), true);
assert.equal(isAccountantMutationAllowed('POST', '/vat/filings/uuid/submitted'), true);

assert.equal(isAccountantMutationAllowed('POST', '/annex38/sites/uuid/periods/2026-09/filings'), true);
assert.equal(isAccountantMutationAllowed('POST', '/annex38/filings/uuid/submitted'), true);

assert.equal(isAccountantMutationAllowed('POST', '/documents'), false);
assert.equal(isAccountantMutationAllowed('POST', '/documents/uuid/post'), false);
assert.equal(isAccountantMutationAllowed('POST', '/documents/uuid/reverse'), false);
assert.equal(isAccountantMutationAllowed('POST', '/sales'), false);
assert.equal(isAccountantMutationAllowed('POST', '/sales/uuid/void'), false);
assert.equal(isAccountantMutationAllowed('PUT', '/company'), false);
assert.equal(isAccountantMutationAllowed('PUT', '/vat/settings'), false);
assert.equal(isAccountantMutationAllowed('PUT', '/annex38/sites/uuid'), false);
assert.equal(isAccountantMutationAllowed('POST', '/products'), false);
assert.equal(isAccountantMutationAllowed('POST', '/partners'), false);
assert.equal(isAccountantMutationAllowed('PATCH', '/users/uuid'), false);

console.log('accountant-allowlist.test.ts: ok');
