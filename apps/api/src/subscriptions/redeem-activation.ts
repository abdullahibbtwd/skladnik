import { Prisma, type SubscriptionStatus } from '@prisma/client';

const LIVE: SubscriptionStatus[] = ['TRIAL', 'ACTIVE', 'EXPIRED', 'SUSPENDED'];

export type RedeemActivationInput = {
  codeHash: string;
  companyId: string;
  userId: string;
  now?: Date;
};

export type RedeemActivationResult = {
  subscriptionId: string;
  plan: string;
  maxUsers: number;
  termMonths: number;
  startsAt: Date;
  expiresAt: Date;
  replacedSubscriptionIds: string[];
};

/**
 * Atomically redeem a PENDING activation code onto a company.
 * Uses row locks + conditional updates so concurrent redeemers cannot both succeed.
 * Returns null on any failure (caller maps to a generic client error).
 */
export async function redeemActivationCodeAtomic(
  tx: Prisma.TransactionClient,
  input: RedeemActivationInput,
): Promise<RedeemActivationResult | null> {
  const now = input.now ?? new Date();

  const locked = await tx.$queryRaw<
    {
      codeId: string;
      subscriptionId: string;
      termMonths: number;
      plan: string;
      maxUsers: number;
      status: SubscriptionStatus;
      companyId: string | null;
    }[]
  >`
    SELECT
      c.id AS "codeId",
      s.id AS "subscriptionId",
      s."termMonths" AS "termMonths",
      s.plan::text AS plan,
      s."maxUsers" AS "maxUsers",
      s.status AS status,
      s."companyId" AS "companyId"
    FROM "ActivationCode" c
    INNER JOIN "Subscription" s ON s.id = c."subscriptionId"
    WHERE c."codeHash" = ${input.codeHash}
      AND c."redeemedAt" IS NULL
      AND c."revokedAt" IS NULL
      AND c."expiresAt" > ${now}
      AND s.status = 'PENDING'
      AND s."companyId" IS NULL
    FOR UPDATE OF c, s
  `;

  if (locked.length !== 1) return null;
  const row = locked[0]!;

  const codeUpdate = await tx.activationCode.updateMany({
    where: {
      id: row.codeId,
      redeemedAt: null,
      revokedAt: null,
      expiresAt: { gt: now },
    },
    data: {
      redeemedAt: now,
      redeemedByUserId: input.userId,
      redeemedCompanyId: input.companyId,
      codeCiphertext: null,
    },
  });
  if (codeUpdate.count !== 1) return null;

  const live = await tx.subscription.findMany({
    where: {
      companyId: input.companyId,
      status: { in: LIVE },
      id: { not: row.subscriptionId },
    },
    select: { id: true, status: true },
  });

  const replacedSubscriptionIds: string[] = [];
  for (const existing of live) {
    const revoked = await tx.subscription.updateMany({
      where: { id: existing.id, status: existing.status, companyId: input.companyId },
      data: { status: 'REVOKED', version: { increment: 1 } },
    });
    if (revoked.count !== 1) return null;
    replacedSubscriptionIds.push(existing.id);
    await tx.subscriptionEvent.create({
      data: {
        subscriptionId: existing.id,
        type: 'STATUS_CHANGED',
        fromStatus: existing.status,
        toStatus: 'REVOKED',
        actorType: 'USER',
        actorId: input.userId,
        payload: { reason: 'replaced_by_activation', newSubscriptionId: row.subscriptionId },
      },
    });
  }

  const expiresAt = addCalendarMonths(now, row.termMonths);
  const activated = await tx.subscription.updateMany({
    where: {
      id: row.subscriptionId,
      status: 'PENDING',
      companyId: null,
    },
    data: {
      status: 'ACTIVE',
      companyId: input.companyId,
      startsAt: now,
      expiresAt,
      activatedAt: now,
      activatedByUserId: input.userId,
      version: { increment: 1 },
    },
  });
  if (activated.count !== 1) return null;

  await tx.subscriptionEvent.create({
    data: {
      subscriptionId: row.subscriptionId,
      type: 'ACTIVATED',
      fromStatus: 'PENDING',
      toStatus: 'ACTIVE',
      actorType: 'USER',
      actorId: input.userId,
      payload: {
        companyId: input.companyId,
        startsAt: now.toISOString(),
        expiresAt: expiresAt.toISOString(),
        replacedSubscriptionIds,
      },
    },
  });
  await tx.subscriptionEvent.create({
    data: {
      subscriptionId: row.subscriptionId,
      type: 'STATUS_CHANGED',
      fromStatus: 'PENDING',
      toStatus: 'ACTIVE',
      actorType: 'USER',
      actorId: input.userId,
    },
  });

  return {
    subscriptionId: row.subscriptionId,
    plan: row.plan,
    maxUsers: row.maxUsers,
    termMonths: row.termMonths,
    startsAt: now,
    expiresAt,
    replacedSubscriptionIds,
  };
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
