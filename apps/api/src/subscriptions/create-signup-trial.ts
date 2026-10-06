import type { Prisma } from '@prisma/client';
import { TRIAL_DAYS } from '@skladnik/shared';

/** Defaults for the automatic signup trial. */
export const TRIAL_PLAN = 'STARTER' as const;
export const TRIAL_MAX_USERS = 5;

type Tx = Prisma.TransactionClient;

/** Create a 14-day TRIAL subscription for a newly signed-up company (same transaction). */
export async function createSignupTrialSubscription(tx: Tx, companyId: string, now = new Date()) {
  const expiresAt = new Date(now.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
  const subscription = await tx.subscription.create({
    data: {
      companyId,
      plan: TRIAL_PLAN,
      status: 'TRIAL',
      maxUsers: TRIAL_MAX_USERS,
      // CHECK requires >= 1; trial length is driven by expiresAt, not termMonths.
      termMonths: 1,
      startsAt: now,
      expiresAt,
    },
  });
  await tx.subscriptionEvent.create({
    data: {
      subscriptionId: subscription.id,
      type: 'CREATED',
      toStatus: 'TRIAL',
      actorType: 'SYSTEM',
      payload: { reason: 'signup_trial', days: TRIAL_DAYS },
    },
  });
  return subscription;
}
