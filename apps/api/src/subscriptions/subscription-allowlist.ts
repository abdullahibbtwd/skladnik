/**
 * Subscription read-only gate helpers (enforce mode).
 * Path-based exports are gone — use @AllowWithoutSubscription on handlers.
 * Safe HTTP methods stay allowed for read_only entitlements.
 */

import { isSafeHttpMethod } from '../auth/accountant-allowlist';

/**
 * Decide if enforce mode would reject this request for the given entitlement access.
 * `allowWithout` is true when the handler (or controller) has @AllowWithoutSubscription.
 */
export function wouldSubscriptionBlock(
  access: 'full' | 'read_only' | 'none',
  method: string,
  allowWithout: boolean,
): boolean {
  if (access === 'full') return false;
  if (allowWithout) return false;
  if (access === 'none') {
    // Hard lock: no reads unless the route is explicitly exempt.
    return true;
  }
  // read_only — mutations blocked; GET/HEAD/OPTIONS still work.
  return !isSafeHttpMethod(method);
}
