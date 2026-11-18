/** Pure eligibility helpers for trial onboarding / lifecycle emails. */

import { utcDayStart } from './subscription-reminders';

/** Same 24h grace as expiry reminders — avoid emailing brand-new accounts. */
export const FIRST_SCAN_NUDGE_MIN_AGE_MS = 24 * 60 * 60 * 1000;

/** Calendar days before trial expiry for the "3 days left" email (~day 11–12 of a 14-day trial). */
export const TRIAL_ENDING_DAYS_BEFORE = 3;

export type FirstScanNudgeEligibilityInput = {
  now?: Date;
  companyCreatedAt: Date | string;
  firstScanAt: Date | string | null | undefined;
  nudgeSentAt: Date | string | null | undefined;
  subscriptionStatus: string;
  subscriptionExpiresAt: Date | string | null | undefined;
  ownerEmailVerifiedAt: Date | string | null | undefined;
};

function asDate(value: Date | string | null | undefined): Date | null {
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isFinite(d.getTime()) ? d : null;
}

/** Trial still grants write access (status TRIAL and not past expiresAt). */
export function isSubscriptionWithinTrial(
  status: string,
  expiresAt: Date | string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (status !== 'TRIAL') return false;
  const end = asDate(expiresAt);
  if (!end) return false;
  return end.getTime() > now.getTime();
}

/**
 * First-scan nudge: verified owner, company older than 24h, never scanned,
 * never nudged, and still inside an active TRIAL window.
 */
export function isEligibleForFirstScanNudge(input: FirstScanNudgeEligibilityInput): boolean {
  const now = input.now ?? new Date();
  if (asDate(input.nudgeSentAt)) return false;
  if (asDate(input.firstScanAt)) return false;
  if (!asDate(input.ownerEmailVerifiedAt)) return false;

  const createdAt = asDate(input.companyCreatedAt);
  if (!createdAt) return false;
  if (now.getTime() - createdAt.getTime() < FIRST_SCAN_NUDGE_MIN_AGE_MS) return false;

  return isSubscriptionWithinTrial(input.subscriptionStatus, input.subscriptionExpiresAt, now);
}

export type TrialEndingEligibilityInput = {
  now?: Date;
  trialEndingSentAt: Date | string | null | undefined;
  subscriptionStatus: string;
  subscriptionExpiresAt: Date | string | null | undefined;
  ownerEmailVerifiedAt: Date | string | null | undefined;
  /** Override for tests; defaults to TRIAL_ENDING_DAYS_BEFORE. */
  daysBefore?: number;
};

/** "3 days left" email for TRIAL subs whose expiry calendar day is N days ahead. */
export function isEligibleForTrialEndingEmail(input: TrialEndingEligibilityInput): boolean {
  const now = input.now ?? new Date();
  if (asDate(input.trialEndingSentAt)) return false;
  if (!asDate(input.ownerEmailVerifiedAt)) return false;
  if (input.subscriptionStatus !== 'TRIAL') return false;

  const expiresAt = asDate(input.subscriptionExpiresAt);
  if (!expiresAt) return false;

  const daysBefore = input.daysBefore ?? TRIAL_ENDING_DAYS_BEFORE;
  const target = utcDayStart(now);
  target.setUTCDate(target.getUTCDate() + daysBefore);
  const expiryDay = utcDayStart(expiresAt);
  return expiryDay.getTime() === target.getTime();
}

export type TrialEndedEligibilityInput = {
  now?: Date;
  trialEndedSentAt: Date | string | null | undefined;
  subscriptionStatus: string;
  subscriptionExpiresAt: Date | string | null | undefined;
  ownerEmailVerifiedAt: Date | string | null | undefined;
};

/**
 * Day-after-expiry email: TRIAL (or EXPIRED) whose expiresAt calendar day was yesterday.
 * Status may still be TRIAL; entitlement already treats past expiry as read-only.
 */
export function isEligibleForTrialEndedEmail(input: TrialEndedEligibilityInput): boolean {
  const now = input.now ?? new Date();
  if (asDate(input.trialEndedSentAt)) return false;
  if (!asDate(input.ownerEmailVerifiedAt)) return false;
  if (input.subscriptionStatus !== 'TRIAL' && input.subscriptionStatus !== 'EXPIRED') return false;

  const expiresAt = asDate(input.subscriptionExpiresAt);
  if (!expiresAt) return false;
  if (expiresAt.getTime() > now.getTime()) return false;

  const yesterday = utcDayStart(now);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  return utcDayStart(expiresAt).getTime() === yesterday.getTime();
}
