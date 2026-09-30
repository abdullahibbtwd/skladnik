import { isRealPostedActivity, openingBalanceRoleAllowed } from './opening-balance';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

assert(openingBalanceRoleAllowed('OWNER'), 'owner may open stock');
assert(!openingBalanceRoleAllowed('ACCOUNTANT'), 'accountant blocked');
assert(!openingBalanceRoleAllowed('SITE_MANAGER'), 'manager blocked');
assert(!openingBalanceRoleAllowed('STAFF'), 'staff blocked');

assert(isRealPostedActivity('INVOICE'), 'invoice locks');
assert(isRealPostedActivity('SALE'), 'sale locks');
assert(isRealPostedActivity('TRANSFER'), 'transfer locks');
assert(!isRealPostedActivity('OPENING_BALANCE'), 'opening itself does not lock');

console.log('opening-balance tests passed');
