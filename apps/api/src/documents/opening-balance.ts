/**
 * Opening stock is Owner-only and only while the site has no other posted activity.
 * Once a real document (invoice, sale, transfer, …) is posted for the site, opening
 * balances stay locked so history is not rewritten under later movements.
 */
export function openingBalanceRoleAllowed(role: string | null | undefined): boolean {
  return role === 'OWNER';
}

/** Posted documents that count as "real" activity and lock further opening balances. */
export function isRealPostedActivity(type: string): boolean {
  return type !== 'OPENING_BALANCE';
}
