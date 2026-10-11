/**
 * Renewing an ACTIVE plan SUPERSEDES the old row (keeps history) instead of REVOKED.
 * Requires DATABASE_URL. Skips when unreachable.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'crypto';
import * as bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';
import { addCalendarMonths } from '@skladnik/shared';
import { issueActivationCode } from './activation-code';
import { redeemActivationCodeAtomic } from './redeem-activation';

const pepper = process.env.ACTIVATION_CODE_PEPPER ?? 'dev-activation-code-pepper-change-me';

async function main() {
  const prisma = new PrismaClient();
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    console.log('activation-supersede.test.ts: skipped (database unreachable)');
    await prisma.$disconnect();
    return;
  }

  const companyId = randomUUID();
  const userId = randomUUID();
  const passwordHash = await bcrypt.hash('SupersedeTest1!', 4);
  const now = new Date(Date.UTC(2026, 5, 15, 12, 0, 0));
  const oldExpires = new Date(Date.UTC(2026, 6, 15, 12, 0, 0));
  let oldSubId = '';
  let newSubId = '';

  try {
    await prisma.company.create({
      data: {
        id: companyId,
        name: `Supersede ${companyId.slice(0, 8)}`,
        eik: '175074406',
        users: {
          create: {
            id: userId,
            email: `super-${companyId.slice(0, 8)}@example.com`,
            name: 'Owner',
            role: 'OWNER',
            passwordHash,
          },
        },
      },
    });

    const oldSub = await prisma.subscription.create({
      data: {
        companyId,
        plan: 'PRO',
        status: 'ACTIVE',
        maxUsers: 5,
        termMonths: 12,
        startsAt: new Date(Date.UTC(2025, 6, 15, 12, 0, 0)),
        expiresAt: oldExpires,
      },
    });
    oldSubId = oldSub.id;

    const issued = issueActivationCode(pepper, now);
    const pending = await prisma.subscription.create({
      data: {
        plan: 'PRO',
        status: 'PENDING',
        maxUsers: 5,
        termMonths: 12,
        activationCodes: {
          create: {
            codeHash: issued.codeHash,
            codePrefix: issued.codePrefix,
            expiresAt: issued.expiresAt,
          },
        },
      },
    });
    newSubId = pending.id;

    const result = await prisma.$transaction((tx) =>
      redeemActivationCodeAtomic(tx, {
        codeHash: issued.codeHash,
        companyId,
        userId,
        now,
      }),
    );

    assert.ok(result);
    assert.equal(result.kind, 'renew');
    assert.equal(result.status, 'ACTIVE');
    assert.deepEqual(result.supersededSubscriptionIds, [oldSubId]);
    assert.equal(result.expiresAt.toISOString(), addCalendarMonths(oldExpires, 12).toISOString());

    const oldRow = await prisma.subscription.findUniqueOrThrow({ where: { id: oldSubId } });
    assert.equal(oldRow.status, 'SUPERSEDED');
    assert.equal(oldRow.companyId, companyId);

    const events = await prisma.subscriptionEvent.findMany({
      where: { subscriptionId: oldSubId },
      orderBy: { createdAt: 'asc' },
    });
    assert.ok(events.some((e) => e.toStatus === 'SUPERSEDED'));
  } finally {
    await prisma.$executeRawUnsafe(`ALTER TABLE "SubscriptionEvent" DISABLE TRIGGER "SubscriptionEvent_append_only"`);
    try {
      await prisma.subscriptionEvent.deleteMany({
        where: { subscriptionId: { in: [oldSubId, newSubId].filter(Boolean) } },
      });
      await prisma.activationCode.deleteMany({
        where: { subscriptionId: { in: [oldSubId, newSubId].filter(Boolean) } },
      });
      await prisma.subscription.deleteMany({ where: { companyId } });
      await prisma.user.deleteMany({ where: { companyId } });
      await prisma.company.delete({ where: { id: companyId } }).catch(() => undefined);
    } finally {
      await prisma.$executeRawUnsafe(`ALTER TABLE "SubscriptionEvent" ENABLE TRIGGER "SubscriptionEvent_append_only"`);
      await prisma.$disconnect();
    }
  }

  console.log('activation-supersede.test.ts: ok');
}

export default main();
