/**
 * CAF-02 and the café till addendum.
 * Staff may create a pending product from a scan line, not from the catalog.
 * A cashier sells dishes; staff does not.
 */
import assert from 'node:assert/strict';
import { canCreatePendingProduct, canUsePos, canWriteProductCatalog } from '@skladnik/shared';

assert.equal(canCreatePendingProduct('STAFF'), true);
assert.equal(canCreatePendingProduct('OWNER'), true);
assert.equal(canCreatePendingProduct('SITE_MANAGER'), true);
assert.equal(canCreatePendingProduct('CASHIER'), false);
assert.equal(canCreatePendingProduct('ACCOUNTANT'), false);

assert.equal(canWriteProductCatalog('STAFF'), false);
assert.equal(canWriteProductCatalog('SITE_MANAGER'), false);
assert.equal(canWriteProductCatalog('OWNER'), true);

assert.equal(canUsePos('CASHIER'), true, 'cashier sells dishes at the till');
assert.equal(canUsePos('STAFF'), false, 'staff cannot sell');
assert.equal(canUsePos('SITE_MANAGER'), true);
assert.equal(canUsePos('OWNER'), true);

console.log('cafe-role tests passed');
