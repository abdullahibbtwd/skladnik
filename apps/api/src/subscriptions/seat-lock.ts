import type { Prisma } from '@prisma/client';
import { resolveEntitlement, type SubscriptionStatus } from '@skladnik/shared';
import { apiPaymentRequired } from '../common/api-error';

type LockedSubscription = {
  id: string;
  maxUsers: number;
  status: SubscriptionStatus;
  expiresAt: Date | null;
};

/**
 * Lock the company's live subscription row and ensure there is a free seat
 * for one new active user. Concurrent invite accepts serialize on FOR UPDATE.
 */
export async function assertSeatAvailable(
  tx: Prisma.TransactionClient,
  companyId: string,
  now: Date = new Date(),
): Promise<{ subscriptionId: string; maxUsers: number; seatsUsed: number }> {
  const locked = await tx.$queryRaw<LockedSubscription[]>`
    SELECT
      s.id,
      s."maxUsers" AS "maxUsers",
      s.status::text AS status,
      s."expiresAt" AS "expiresAt"
    FROM "Subscription" s
    WHERE s."companyId" = ${companyId}
      AND s.status IN ('TRIAL', 'ACTIVE', 'EXPIRED', 'SUSPENDED')
    ORDER BY s."createdAt" DESC
    LIMIT 1
    FOR UPDATE OF s
  `;

  if (locked.length !== 1) {
    throw apiPaymentRequired(
      'SUBSCRIPTION_REQUIRED',
      'Your subscription has expired or is suspended. You can still view and export data, or activate a new code.',
      { reason: 'NO_SUBSCRIPTION' },
    );
  }

  const row = locked[0]!;
  const entitlement = resolveEntitlement(
    { status: row.status, expiresAt: row.expiresAt },
    now,
  );
  if (!entitlement.canWrite) {
    throw apiPaymentRequired(
      'SUBSCRIPTION_REQUIRED',
      entitlement.reason === 'SUSPENDED'
        ? 'This subscription is suspended. Activate a new code or contact support.'
        : 'Your subscription has expired or is suspended. You can still view and export data, or activate a new code.',
      { reason: entitlement.reason ?? 'EXPIRED' },
    );
  }

  const seatsUsed = await tx.user.count({
    where: { companyId, isActive: true },
  });

  if (seatsUsed >= row.maxUsers) {
    throw apiPaymentRequired(
      'SUBSCRIPTION_SEAT_LIMIT',
      'This company has reached its seat limit. Free a seat or upgrade the plan before inviting more users.',
      { seatsUsed, seatsMax: row.maxUsers },
    );
  }

  return { subscriptionId: row.id, maxUsers: row.maxUsers, seatsUsed };
}
