import type { SubscriptionPlan } from './subscription';

/**
 * DEFAULT activation lifecycle rules (QA Batch B).
 * Change here only — redeem + preview both call computeActivationSchedule().
 *
 * - same plan: new_expires = max(now, current_expires) + term_months; old → SUPERSEDED
 * - upgrade: starts now; term_months from now + remaining days on current; old → SUPERSEDED
 * - downgrade: QUEUED to start when current term ends (current stays ACTIVE)
 */
export const DEFAULT_ACTIVATION_LIFECYCLE_RULES = {
  samePlan: 'extend_from_max_now_or_expiry',
  upgrade: 'start_now_carry_remaining_days',
  downgrade: 'queue_until_current_ends',
} as const;

/** Higher number = higher tier. Used only for upgrade/downgrade classification. */
export const SUBSCRIPTION_PLAN_TIER: Record<SubscriptionPlan, number> = {
  STARTER: 1,
  PRO: 2,
  MULTI_LOCATION: 3,
};

export type ActivationKind = 'new' | 'renew' | 'upgrade' | 'downgrade';

export type ActivationScheduleInput = {
  newPlan: SubscriptionPlan;
  termMonths: number;
  now: Date;
  current: {
    plan: SubscriptionPlan;
    expiresAt: Date | string | null;
  } | null;
};

export type ActivationSchedule = {
  kind: ActivationKind;
  /** Resulting status of the redeemed subscription row. */
  status: 'ACTIVE' | 'QUEUED';
  startsAt: Date;
  expiresAt: Date;
  /** When true, the company's current live row should become SUPERSEDED. */
  supersedeCurrent: boolean;
};

export function compareSubscriptionPlanTier(a: SubscriptionPlan, b: SubscriptionPlan): number {
  return SUBSCRIPTION_PLAN_TIER[a] - SUBSCRIPTION_PLAN_TIER[b];
}

export function classifyActivationKind(
  currentPlan: SubscriptionPlan | null,
  newPlan: SubscriptionPlan,
): ActivationKind {
  if (!currentPlan) return 'new';
  const delta = compareSubscriptionPlanTier(newPlan, currentPlan);
  if (delta === 0) return 'renew';
  if (delta > 0) return 'upgrade';
  return 'downgrade';
}

/** Add whole calendar months in UTC, clamping to the last day of the month when needed. */
export function addCalendarMonths(from: Date, months: number): Date {
  const result = new Date(from.getTime());
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const daysInMonth = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(day, daysInMonth));
  return result;
}

function asDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  return value instanceof Date ? value : new Date(value);
}

/**
 * Single place for activation start/expiry math (preview + redeem).
 * See DEFAULT_ACTIVATION_LIFECYCLE_RULES.
 */
export function computeActivationSchedule(input: ActivationScheduleInput): ActivationSchedule {
  const now = input.now;
  const kind = classifyActivationKind(input.current?.plan ?? null, input.newPlan);

  if (kind === 'new' || !input.current) {
    return {
      kind: 'new',
      status: 'ACTIVE',
      startsAt: now,
      expiresAt: addCalendarMonths(now, input.termMonths),
      supersedeCurrent: false,
    };
  }

  const currentExpires = asDate(input.current.expiresAt);

  if (kind === 'renew') {
    const baseMs = Math.max(now.getTime(), currentExpires?.getTime() ?? now.getTime());
    const base = new Date(baseMs);
    return {
      kind: 'renew',
      status: 'ACTIVE',
      startsAt: now,
      expiresAt: addCalendarMonths(base, input.termMonths),
      supersedeCurrent: true,
    };
  }

  if (kind === 'upgrade') {
    const remainingMs = Math.max(0, (currentExpires?.getTime() ?? now.getTime()) - now.getTime());
    const termEnd = addCalendarMonths(now, input.termMonths);
    return {
      kind: 'upgrade',
      status: 'ACTIVE',
      startsAt: now,
      expiresAt: new Date(termEnd.getTime() + remainingMs),
      supersedeCurrent: true,
    };
  }

  // downgrade — queue until current term ends
  const startsAt = currentExpires && currentExpires.getTime() > now.getTime() ? currentExpires : now;
  return {
    kind: 'downgrade',
    status: 'QUEUED',
    startsAt,
    expiresAt: addCalendarMonths(startsAt, input.termMonths),
    supersedeCurrent: false,
  };
}

/** EIK mismatch policy for activation (platform setting). Default WARN. */
export const ACTIVATION_EIK_MISMATCH_MODES = ['WARN', 'BLOCK'] as const;
export type ActivationEikMismatchMode = (typeof ACTIVATION_EIK_MISMATCH_MODES)[number];
export const DEFAULT_ACTIVATION_EIK_MISMATCH_MODE: ActivationEikMismatchMode = 'WARN';
