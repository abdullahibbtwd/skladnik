/** SaaS plan tiers (aligned with Prisma SubscriptionPlan). */
export const SUBSCRIPTION_PLANS = ['STARTER', 'PRO', 'MULTI_LOCATION'] as const;
export type SubscriptionPlan = (typeof SUBSCRIPTION_PLANS)[number];

/** Subscription lifecycle statuses (aligned with Prisma SubscriptionStatus). */
export const SUBSCRIPTION_STATUSES = [
  'PENDING',
  'TRIAL',
  'ACTIVE',
  'EXPIRED',
  'SUSPENDED',
  'REVOKED',
] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

/**
 * Statuses that occupy the "one live subscription per company" slot.
 * PENDING is unbound; REVOKED is terminal and frees the slot.
 */
export const LIVE_SUBSCRIPTION_STATUSES = [
  'TRIAL',
  'ACTIVE',
  'EXPIRED',
  'SUSPENDED',
] as const satisfies readonly SubscriptionStatus[];
export type LiveSubscriptionStatus = (typeof LIVE_SUBSCRIPTION_STATUSES)[number];

export function isLiveSubscriptionStatus(status: SubscriptionStatus): status is LiveSubscriptionStatus {
  return (LIVE_SUBSCRIPTION_STATUSES as readonly string[]).includes(status);
}

/**
 * Allowed status transitions. Initial create uses PENDING / TRIAL
 * (not represented as edges from a prior status).
 */
export const SUBSCRIPTION_STATUS_TRANSITIONS: Readonly<
  Record<SubscriptionStatus, readonly SubscriptionStatus[]>
> = {
  PENDING: ['ACTIVE', 'REVOKED'],
  TRIAL: ['ACTIVE', 'EXPIRED', 'SUSPENDED', 'REVOKED'],
  ACTIVE: ['EXPIRED', 'SUSPENDED', 'REVOKED'],
  EXPIRED: ['ACTIVE', 'REVOKED'],
  SUSPENDED: ['ACTIVE', 'EXPIRED', 'REVOKED'],
  REVOKED: [],
};

export function canTransitionSubscriptionStatus(
  from: SubscriptionStatus,
  to: SubscriptionStatus,
): boolean {
  if (from === to) return false;
  return SUBSCRIPTION_STATUS_TRANSITIONS[from].includes(to);
}

/** Statuses that may be written on insert (no prior row). */
export const SUBSCRIPTION_CREATE_STATUSES = ['PENDING', 'TRIAL'] as const satisfies readonly SubscriptionStatus[];
export type SubscriptionCreateStatus = (typeof SUBSCRIPTION_CREATE_STATUSES)[number];

export function isSubscriptionCreateStatus(status: SubscriptionStatus): status is SubscriptionCreateStatus {
  return (SUBSCRIPTION_CREATE_STATUSES as readonly string[]).includes(status);
}

/** New company signup trial length. */
export const TRIAL_DAYS = 14;

export type EntitlementAccess = 'full' | 'read_only' | 'none';

export type EntitlementInput = {
  status: SubscriptionStatus;
  expiresAt: Date | string | null;
} | null;

export type Entitlement = {
  access: EntitlementAccess;
  /** Machine-readable reason when access is not full. */
  reason: 'NO_SUBSCRIPTION' | 'SUSPENDED' | 'EXPIRED' | 'REVOKED' | null;
  status: SubscriptionStatus | 'NONE';
  expiresAt: Date | null;
  /** Mutations allowed (POST/PATCH/PUT/DELETE) — false when read-only or none. */
  canWrite: boolean;
  /** Exports / compliance downloads stay available after expiry. */
  canExport: boolean;
};

/**
 * Shared entitlement decision for guards and UI.
 * Expired / past-expiresAt tenants stay read-only and may still export.
 */
export function resolveEntitlement(subscription: EntitlementInput, now: Date = new Date()): Entitlement {
  if (!subscription) {
    return {
      access: 'read_only',
      reason: 'NO_SUBSCRIPTION',
      expiresAt: null,
      status: 'NONE',
      canWrite: false,
      canExport: true,
    };
  }

  const expiresAt = subscription.expiresAt
    ? subscription.expiresAt instanceof Date
      ? subscription.expiresAt
      : new Date(subscription.expiresAt)
    : null;
  const pastExpiry = Boolean(expiresAt && expiresAt.getTime() <= now.getTime());

  if (subscription.status === 'SUSPENDED') {
    return {
      access: 'read_only',
      reason: 'SUSPENDED',
      status: subscription.status,
      expiresAt,
      canWrite: false,
      canExport: true,
    };
  }

  if (subscription.status === 'REVOKED') {
    return {
      access: 'none',
      reason: 'REVOKED',
      status: subscription.status,
      expiresAt,
      canWrite: false,
      canExport: false,
    };
  }

  if (subscription.status === 'EXPIRED' || pastExpiry) {
    return {
      access: 'read_only',
      reason: 'EXPIRED',
      status: subscription.status,
      expiresAt,
      canWrite: false,
      canExport: true,
    };
  }

  if (subscription.status === 'TRIAL' || subscription.status === 'ACTIVE') {
    return {
      access: 'full',
      reason: null,
      status: subscription.status,
      expiresAt,
      canWrite: true,
      canExport: true,
    };
  }

  // PENDING unbound should not be attached to a company; treat as no subscription.
  return {
    access: 'read_only',
    reason: 'NO_SUBSCRIPTION',
    status: subscription.status,
    expiresAt,
    canWrite: false,
    canExport: true,
  };
}
