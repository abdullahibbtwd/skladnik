import { Prisma, type SubscriptionPlan, type SubscriptionStatus } from '@prisma/client';
import {
  addCalendarMonths,
  computeActivationSchedule,
  type ActivationKind,
} from '@skladnik/shared';

const LIVE: SubscriptionStatus[] = ['TRIAL', 'ACTIVE', 'EXPIRED', 'SUSPENDED'];

export type RedeemActivationInput = {
  codeHash: string;
  companyId: string;
  userId: string;
  now?: Date;
  /** Optional audit payload when owner confirmed an EIK mismatch (WARN mode). */
  eikMismatchAudit?: {
    buyerEik: string;
    companyEik: string | null;
  } | null;
};

export type RedeemActivationResult = {
  subscriptionId: string;
  plan: string;
  maxUsers: number;
  termMonths: number;
  startsAt: Date;
  expiresAt: Date;
  status: 'ACTIVE' | 'QUEUED';
  kind: ActivationKind;
  supersededSubscriptionIds: string[];
};

export { addCalendarMonths };

/**
 * Atomically redeem a PENDING activation code onto a company.
 * Applies DEFAULT_ACTIVATION_LIFECYCLE_RULES via computeActivationSchedule().
 * Concurrent redeemers: exactly one winner (conditional code update).
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
      plan: SubscriptionPlan;
      maxUsers: number;
      status: SubscriptionStatus;
      companyId: string | null;
    }[]
  >`
    SELECT
      c.id AS "codeId",
      s.id AS "subscriptionId",
      s."termMonths" AS "termMonths",
      s.plan AS plan,
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

  const current = await tx.subscription.findFirst({
    where: {
      companyId: input.companyId,
      status: { in: LIVE },
      id: { not: row.subscriptionId },
    },
    orderBy: { createdAt: 'desc' },
    select: { id: true, status: true, plan: true, expiresAt: true },
  });

  const schedule = computeActivationSchedule({
    newPlan: row.plan,
    termMonths: row.termMonths,
    now,
    current: current
      ? { plan: current.plan, expiresAt: current.expiresAt }
      : null,
  });

  const supersededSubscriptionIds: string[] = [];

  if (schedule.supersedeCurrent && current) {
    const superseded = await tx.subscription.updateMany({
      where: { id: current.id, status: current.status, companyId: input.companyId },
      data: { status: 'SUPERSEDED', version: { increment: 1 } },
    });
    if (superseded.count !== 1) return null;
    supersededSubscriptionIds.push(current.id);
    await tx.subscriptionEvent.create({
      data: {
        subscriptionId: current.id,
        type: 'STATUS_CHANGED',
        fromStatus: current.status,
        toStatus: 'SUPERSEDED',
        actorType: 'USER',
        actorId: input.userId,
        payload: {
          reason: 'replaced_by_activation',
          newSubscriptionId: row.subscriptionId,
          kind: schedule.kind,
        },
      },
    });
  }

  // A prior queued downgrade is replaced by this redeem.
  const priorQueued = await tx.subscription.findMany({
    where: {
      companyId: input.companyId,
      status: 'QUEUED',
      id: { not: row.subscriptionId },
    },
    select: { id: true },
  });
  for (const queued of priorQueued) {
    const updated = await tx.subscription.updateMany({
      where: { id: queued.id, status: 'QUEUED', companyId: input.companyId },
      data: { status: 'SUPERSEDED', version: { increment: 1 } },
    });
    if (updated.count !== 1) return null;
    supersededSubscriptionIds.push(queued.id);
    await tx.subscriptionEvent.create({
      data: {
        subscriptionId: queued.id,
        type: 'STATUS_CHANGED',
        fromStatus: 'QUEUED',
        toStatus: 'SUPERSEDED',
        actorType: 'USER',
        actorId: input.userId,
        payload: { reason: 'replaced_by_activation', newSubscriptionId: row.subscriptionId },
      },
    });
  }

  const activated = await tx.subscription.updateMany({
    where: {
      id: row.subscriptionId,
      status: 'PENDING',
      companyId: null,
    },
    data: {
      status: schedule.status,
      companyId: input.companyId,
      startsAt: schedule.startsAt,
      expiresAt: schedule.expiresAt,
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
      toStatus: schedule.status,
      actorType: 'USER',
      actorId: input.userId,
      payload: {
        companyId: input.companyId,
        kind: schedule.kind,
        startsAt: schedule.startsAt.toISOString(),
        expiresAt: schedule.expiresAt.toISOString(),
        supersededSubscriptionIds,
        eikMismatch: input.eikMismatchAudit ?? null,
      },
    },
  });
  await tx.subscriptionEvent.create({
    data: {
      subscriptionId: row.subscriptionId,
      type: 'STATUS_CHANGED',
      fromStatus: 'PENDING',
      toStatus: schedule.status,
      actorType: 'USER',
      actorId: input.userId,
      payload: { kind: schedule.kind },
    },
  });

  if (input.eikMismatchAudit) {
    await tx.platformAuditLog.create({
      data: {
        action: 'ACTIVATION_EIK_MISMATCH_CONFIRMED',
        entityType: 'Subscription',
        entityId: row.subscriptionId,
        metadata: {
          companyId: input.companyId,
          userId: input.userId,
          buyerEik: input.eikMismatchAudit.buyerEik,
          companyEik: input.eikMismatchAudit.companyEik,
        },
      },
    });
  }

  return {
    subscriptionId: row.subscriptionId,
    plan: row.plan,
    maxUsers: row.maxUsers,
    termMonths: row.termMonths,
    startsAt: schedule.startsAt,
    expiresAt: schedule.expiresAt,
    status: schedule.status,
    kind: schedule.kind,
    supersededSubscriptionIds,
  };
}

/**
 * Promote QUEUED downgrades whose start time has arrived and whose company
 * no longer has a blocking live ACTIVE/TRIAL/SUSPENDED row (EXPIRED is ok to supersede).
 */
export async function promoteDueQueuedSubscriptions(
  tx: Prisma.TransactionClient,
  now = new Date(),
): Promise<number> {
  const due = await tx.subscription.findMany({
    where: {
      status: 'QUEUED',
      startsAt: { lte: now },
    },
    select: { id: true, companyId: true, startsAt: true, expiresAt: true },
  });

  let promoted = 0;
  for (const queued of due) {
    if (!queued.companyId) continue;

    const blocking = await tx.subscription.findFirst({
      where: {
        companyId: queued.companyId,
        status: { in: ['TRIAL', 'ACTIVE', 'SUSPENDED'] },
        id: { not: queued.id },
      },
      select: { id: true, status: true, expiresAt: true },
    });
    if (blocking && blocking.expiresAt && blocking.expiresAt.getTime() > now.getTime()) {
      continue;
    }

    if (blocking) {
      await tx.subscription.updateMany({
        where: { id: blocking.id, status: blocking.status },
        data: { status: 'SUPERSEDED', version: { increment: 1 } },
      });
      await tx.subscriptionEvent.create({
        data: {
          subscriptionId: blocking.id,
          type: 'STATUS_CHANGED',
          fromStatus: blocking.status,
          toStatus: 'SUPERSEDED',
          actorType: 'SYSTEM',
          payload: { reason: 'queued_activation', newSubscriptionId: queued.id },
        },
      });
    }

    const expiredLive = await tx.subscription.findMany({
      where: {
        companyId: queued.companyId,
        status: 'EXPIRED',
        id: { not: queued.id },
      },
      select: { id: true },
    });
    for (const row of expiredLive) {
      await tx.subscription.updateMany({
        where: { id: row.id, status: 'EXPIRED' },
        data: { status: 'SUPERSEDED', version: { increment: 1 } },
      });
    }

    const updated = await tx.subscription.updateMany({
      where: { id: queued.id, status: 'QUEUED' },
      data: { status: 'ACTIVE', version: { increment: 1 } },
    });
    if (updated.count !== 1) continue;

    await tx.subscriptionEvent.create({
      data: {
        subscriptionId: queued.id,
        type: 'STATUS_CHANGED',
        fromStatus: 'QUEUED',
        toStatus: 'ACTIVE',
        actorType: 'SYSTEM',
        payload: { reason: 'queued_start_reached' },
      },
    });
    promoted += 1;
  }

  return promoted;
}
