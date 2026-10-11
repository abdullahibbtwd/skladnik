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
  'SUPERSEDED',
  'QUEUED',
] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

/**
 * Statuses that occupy the "one live subscription per company" slot.
 * PENDING is unbound; REVOKED / SUPERSEDED / QUEUED do not occupy the live slot.
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
 * Manual (platform admin) status transitions.
 * PENDING → ACTIVE is intentionally removed — activation is via code redeem only.
 * ACTIVE → EXPIRED is system-only (see SYSTEM_SUBSCRIPTION_STATUS_TRANSITIONS).
 */
export const MANUAL_SUBSCRIPTION_STATUS_TRANSITIONS: Readonly<
  Record<SubscriptionStatus, readonly SubscriptionStatus[]>
> = {
  PENDING: ['REVOKED'],
  TRIAL: ['SUSPENDED', 'REVOKED'],
  ACTIVE: ['SUSPENDED', 'REVOKED'],
  EXPIRED: ['REVOKED'],
  SUSPENDED: ['ACTIVE', 'REVOKED'],
  REVOKED: [],
  SUPERSEDED: [],
  QUEUED: ['REVOKED'],
};

/**
 * System-driven transitions (cron / redeem internals may also write status directly).
 */
export const SYSTEM_SUBSCRIPTION_STATUS_TRANSITIONS: Readonly<
  Record<SubscriptionStatus, readonly SubscriptionStatus[]>
> = {
  PENDING: [],
  TRIAL: ['EXPIRED', 'ACTIVE'],
  ACTIVE: ['EXPIRED', 'SUPERSEDED'],
  EXPIRED: ['SUPERSEDED'],
  SUSPENDED: ['EXPIRED', 'SUPERSEDED'],
  REVOKED: [],
  SUPERSEDED: [],
  QUEUED: ['ACTIVE', 'SUPERSEDED', 'REVOKED'],
};

/**
 * @deprecated Prefer MANUAL_ / SYSTEM_ maps. Kept as the platform/UI-facing map
 * (manual transitions only).
 */
export const SUBSCRIPTION_STATUS_TRANSITIONS = MANUAL_SUBSCRIPTION_STATUS_TRANSITIONS;

export function canTransitionSubscriptionStatus(
  from: SubscriptionStatus,
  to: SubscriptionStatus,
): boolean {
  return canManualTransitionSubscriptionStatus(from, to);
}

export function canManualTransitionSubscriptionStatus(
  from: SubscriptionStatus,
  to: SubscriptionStatus,
): boolean {
  if (from === to) return false;
  return MANUAL_SUBSCRIPTION_STATUS_TRANSITIONS[from].includes(to);
}

export function canSystemTransitionSubscriptionStatus(
  from: SubscriptionStatus,
  to: SubscriptionStatus,
): boolean {
  if (from === to) return false;
  return SYSTEM_SUBSCRIPTION_STATUS_TRANSITIONS[from].includes(to);
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
 * QUEUED / SUPERSEDED / PENDING do not grant write access by themselves.
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

  if (subscription.status === 'REVOKED' || subscription.status === 'SUPERSEDED') {
    return {
      access: 'none',
      reason: 'REVOKED',
      status: subscription.status,
      expiresAt,
      canWrite: false,
      canExport: false,
    };
  }

  if (subscription.status === 'QUEUED' || subscription.status === 'PENDING') {
    return {
      access: 'read_only',
      reason: 'NO_SUBSCRIPTION',
      status: subscription.status,
      expiresAt,
      canWrite: false,
      canExport: true,
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

  return {
    access: 'read_only',
    reason: 'NO_SUBSCRIPTION',
    status: subscription.status,
    expiresAt,
    canWrite: false,
    canExport: true,
  };
}
