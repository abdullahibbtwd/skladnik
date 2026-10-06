/**
 * Optimistic concurrency on Subscription.version for status transitions.
 * Requires DATABASE_URL. Skips when DB unreachable.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'crypto';
import { PrismaClient, type SubscriptionStatus } from '@prisma/client';
import { canTransitionSubscriptionStatus } from '@skladnik/shared';

async function tryTransition(
  prisma: PrismaClient,
  id: string,
  expectedVersion: number,
  fromStatus: SubscriptionStatus,
  toStatus: SubscriptionStatus,
) {
  if (!canTransitionSubscriptionStatus(fromStatus, toStatus)) {
    throw new Error(`illegal ${fromStatus}→${toStatus}`);
  }
  return prisma.$transaction(async (tx) => {
    const updated = await tx.subscription.updateMany({
      where: { id, version: expectedVersion, status: fromStatus },
      data: { status: toStatus, version: { increment: 1 } },
    });
    if (updated.count !== 1) {
      return { ok: false as const };
    }
    await tx.subscriptionEvent.create({
      data: {
        subscriptionId: id,
        type: 'STATUS_CHANGED',
        fromStatus,
        toStatus,
        actorType: 'PLATFORM_ADMIN',
        actorId: 'test-admin',
        payload: { reason: 'test' },
      },
    });
    return { ok: true as const };
  });
}

async function main() {
  const prisma = new PrismaClient();
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    console.log('transition-version.test.ts: skipped (database unreachable)');
    await prisma.$disconnect();
    return;
  }

  const id = randomUUID();
  const companyId = randomUUID();
  try {
    await prisma.company.create({
      data: { id: companyId, name: `Transition Co ${companyId.slice(0, 8)}` },
    });
    await prisma.subscription.create({
      data: {
        id,
        companyId,
        plan: 'PRO',
        status: 'ACTIVE',
        maxUsers: 5,
        termMonths: 12,
        version: 1,
        startsAt: new Date(),
        expiresAt: new Date(Date.now() + 86400000),
        activatedAt: new Date(),
      },
    });

    // Stale version → no update (maps to 409 in the service)
    const stale = await tryTransition(prisma, id, 999, 'ACTIVE', 'SUSPENDED');
    assert.equal(stale.ok, false);

    const current = await prisma.subscription.findUniqueOrThrow({ where: { id } });
    assert.equal(current.status, 'ACTIVE');
    assert.equal(current.version, 1);

    // Concurrent transitions: exactly one wins
    const [a, b] = await Promise.all([
      tryTransition(prisma, id, 1, 'ACTIVE', 'SUSPENDED'),
      tryTransition(prisma, id, 1, 'ACTIVE', 'REVOKED'),
    ]);
    const wins = [a, b].filter((r) => r.ok).length;
    const losses = [a, b].filter((r) => !r.ok).length;
    assert.equal(wins, 1, 'exactly one concurrent transition should win');
    assert.equal(losses, 1, 'the other concurrent transition should get a version conflict');

    const after = await prisma.subscription.findUniqueOrThrow({ where: { id } });
    assert.equal(after.version, 2);
    assert.ok(after.status === 'SUSPENDED' || after.status === 'REVOKED');
  } finally {
    await prisma.subscriptionEvent.deleteMany({ where: { subscriptionId: id } }).catch(() => undefined);
    await prisma.subscription.deleteMany({ where: { id } }).catch(() => undefined);
    await prisma.company.deleteMany({ where: { id: companyId } }).catch(() => undefined);
    await prisma.$disconnect();
  }

  console.log('transition-version.test.ts: ok');
}

module.exports = main();
