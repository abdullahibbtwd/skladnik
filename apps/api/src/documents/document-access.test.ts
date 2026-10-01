import assert from 'node:assert/strict';
import { assertDocumentWriteAccess } from './document-access';

const staff: Parameters<typeof assertDocumentWriteAccess>[0] = {
  id: 'u1',
  email: 'c@x',
  name: 'Cashier',
  role: 'STAFF',
  companyId: 'c1',
  siteIds: ['s1'],
  allSites: false,
};

const cashier = { ...staff, role: 'CASHIER' as const, id: 'cash1' };
const manager = { ...staff, role: 'SITE_MANAGER' as const, id: 'm1' };

assertDocumentWriteAccess(manager, 'post', { type: 'RECEIPT', status: 'REVIEW', createdById: 'u1' });
assertDocumentWriteAccess(staff, 'create', undefined, 'RECEIPT');
assertDocumentWriteAccess(staff, 'create', undefined, 'WRITE_OFF');
assertDocumentWriteAccess(staff, 'edit', { type: 'RECEIPT', status: 'DRAFT', createdById: 'u1' });
assertDocumentWriteAccess(staff, 'submit', { type: 'RECEIPT', status: 'DRAFT', createdById: 'u1' });
assertDocumentWriteAccess(staff, 'post', { type: 'WRITE_OFF', status: 'REVIEW', createdById: 'u1' });
// SKL-11: own DRAFT cancel allowed
assertDocumentWriteAccess(staff, 'cancel', { type: 'RECEIPT', status: 'DRAFT', createdById: 'u1' });

function mustFail(label: string, fn: () => void) {
  let failed = false;
  try {
    fn();
  } catch {
    failed = true;
  }
  assert.equal(failed, true, label);
}

mustFail('staff transfer', () => assertDocumentWriteAccess(staff, 'create', undefined, 'TRANSFER'));
mustFail('staff stocktake', () => assertDocumentWriteAccess(staff, 'create', undefined, 'STOCKTAKE'));
mustFail('staff post receipt', () =>
  assertDocumentWriteAccess(staff, 'post', { type: 'RECEIPT', status: 'REVIEW', createdById: 'u1' }),
);
mustFail('staff other draft', () =>
  assertDocumentWriteAccess(staff, 'edit', { type: 'RECEIPT', status: 'DRAFT', createdById: 'other' }),
);
mustFail('staff edit review', () =>
  assertDocumentWriteAccess(staff, 'edit', { type: 'RECEIPT', status: 'REVIEW', createdById: 'u1' }),
);
mustFail('staff cancel review', () =>
  assertDocumentWriteAccess(staff, 'cancel', { type: 'RECEIPT', status: 'REVIEW', createdById: 'u1' }),
);
mustFail('staff cancel posted', () =>
  assertDocumentWriteAccess(staff, 'cancel', { type: 'WRITE_OFF', status: 'POSTED', createdById: 'u1' }),
);
mustFail('staff cancel other draft', () =>
  assertDocumentWriteAccess(staff, 'cancel', { type: 'RECEIPT', status: 'DRAFT', createdById: 'other' }),
);
mustFail('staff reverse', () =>
  assertDocumentWriteAccess(staff, 'reverse', { type: 'WRITE_OFF', status: 'POSTED', createdById: 'u1' }),
);
mustFail('cashier create', () => assertDocumentWriteAccess(cashier, 'create', undefined, 'RECEIPT'));
mustFail('cashier cancel', () =>
  assertDocumentWriteAccess(cashier, 'cancel', { type: 'RECEIPT', status: 'DRAFT', createdById: 'cash1' }),
);

// ACC-01: Accountant is not a document manager.
const accountant = { ...staff, role: 'ACCOUNTANT' as const, id: 'acc1' };
mustFail('accountant create', () => assertDocumentWriteAccess(accountant, 'create', undefined, 'RECEIPT'));
mustFail('accountant post', () =>
  assertDocumentWriteAccess(accountant, 'post', { type: 'RECEIPT', status: 'REVIEW', createdById: 'acc1' }),
);
mustFail('accountant reverse', () =>
  assertDocumentWriteAccess(accountant, 'reverse', { type: 'RECEIPT', status: 'POSTED', createdById: 'acc1' }),
);
mustFail('accountant cancel', () =>
  assertDocumentWriteAccess(accountant, 'cancel', { type: 'RECEIPT', status: 'DRAFT', createdById: 'acc1' }),
);

console.log('document-access tests passed');
