import type { Prisma, PrismaClient } from '@prisma/client';
import {
  LIVE_SUBSCRIPTION_STATUSES,
  resolveEntitlement,
  type Entitlement,
  type SubscriptionStatus,
} from '@skladnik/shared';
import { apiPaymentRequired } from '../common/api-error';

type Client = Prisma.TransactionClient | PrismaClient;

export type CompanySubscriptionRow = {
  id: string;
  status: SubscriptionStatus;
  expiresAt: Date | null;
  maxUsers: number;
};

/** Load the live subscription for a company (if any) and resolve entitlement. */
export async function loadCompanyEntitlement(
  db: Client,
  companyId: string,
  now: Date = new Date(),
): Promise<{ subscription: CompanySubscriptionRow | null; entitlement: Entitlement }> {
  const subscription = await db.subscription.findFirst({
    where: {
      companyId,
      status: { in: [...LIVE_SUBSCRIPTION_STATUSES] },
    },
    orderBy: { createdAt: 'desc' },
    select: { id: true, status: true, expiresAt: true, maxUsers: true },
  });

  const row = subscription
    ? {
        id: subscription.id,
        status: subscription.status as SubscriptionStatus,
        expiresAt: subscription.expiresAt,
        maxUsers: subscription.maxUsers,
      }
    : null;

  return {
    subscription: row,
    entitlement: resolveEntitlement(
      row ? { status: row.status, expiresAt: row.expiresAt } : null,
      now,
    ),
  };
}

/**
 * Shared write gate for HTTP (via guard), OCR workers, and company-scoped mail.
 * Throws 402 SUBSCRIPTION_REQUIRED when the company cannot mutate.
 */
export async function assertCompanyCanWrite(db: Client, companyId: string, now: Date = new Date()) {
  const { entitlement } = await loadCompanyEntitlement(db, companyId, now);
  if (entitlement.canWrite) return entitlement;
  throw apiPaymentRequired(
    'SUBSCRIPTION_REQUIRED',
    entitlement.access === 'none'
      ? 'This workspace subscription has been revoked. Activate a new code to continue.'
      : 'Your subscription has expired or is suspended. You can still view and export data, or activate a new code.',
    { reason: entitlement.reason ?? 'NO_SUBSCRIPTION' },
  );
}
