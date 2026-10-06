/**
 * Concurrent redemption of the same activation code: exactly one winner.
 * Requires DATABASE_URL (Postgres). Skips cleanly when the DB is unreachable.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'crypto';
import * as bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';
import { hashActivationCode, issueActivationCode } from './activation-code';
import { redeemActivationCodeAtomic } from './redeem-activation';

const pepper = process.env.ACTIVATION_CODE_PEPPER ?? 'dev-activation-code-pepper-change-me';

async function main() {
  const prisma = new PrismaClient();
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    console.log('redeem-activation.concurrency.test.ts: skipped (database unreachable)');
    await prisma.$disconnect();
    return;
  }

  const companyId = randomUUID();
  const userA = randomUUID();
  const userB = randomUUID();
  const passwordHash = await bcrypt.hash('ConcurrencyTest1!', 4);
  let subscriptionId = '';

  try {
    await prisma.company.create({
      data: {
        id: companyId,
        name: `Concurrency Co ${companyId.slice(0, 8)}`,
        users: {
          create: [
            {
              id: userA,
              email: `owner-a-${companyId.slice(0, 8)}@example.com`,
              name: 'Owner A',
              role: 'OWNER',
              passwordHash,
            },
            {
              id: userB,
              email: `owner-b-${companyId.slice(0, 8)}@example.com`,
              name: 'Owner B',
              role: 'OWNER',
              passwordHash,
            },
          ],
        },
      },
    });

    const issued = issueActivationCode(pepper);
    assert.equal(hashActivationCode(issued.normalized, pepper), issued.codeHash);

    const subscription = await prisma.subscription.create({
      data: {
        plan: 'STARTER',
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
    subscriptionId = subscription.id;

    const results = await Promise.allSettled([
      prisma.$transaction((tx) =>
        redeemActivationCodeAtomic(tx, {
          codeHash: issued.codeHash,
          companyId,
          userId: userA,
        }),
      ),
      prisma.$transaction((tx) =>
        redeemActivationCodeAtomic(tx, {
          codeHash: issued.codeHash,
          companyId,
          userId: userB,
        }),
      ),
    ]);

    const values = results.map((r) => (r.status === 'fulfilled' ? r.value : null));
    const winners = values.filter(Boolean);
    assert.equal(winners.length, 1, `expected exactly one winner, got ${JSON.stringify(results)}`);
    assert.equal(winners[0]!.subscriptionId, subscription.id);

    const code = await prisma.activationCode.findUniqueOrThrow({ where: { codeHash: issued.codeHash } });
    assert.ok(code.redeemedAt, 'code must be redeemed');
    assert.ok(code.redeemedByUserId === userA || code.redeemedByUserId === userB);

    const active = await prisma.subscription.findMany({
      where: { companyId, status: 'ACTIVE' },
    });
    assert.equal(active.length, 1);
    assert.equal(active[0]!.id, subscription.id);

    const again = await prisma.$transaction((tx) =>
      redeemActivationCodeAtomic(tx, {
        codeHash: issued.codeHash,
        companyId,
        userId: userA,
      }),
    );
    assert.equal(again, null, 're-redeem must fail');

    console.log('redeem-activation.concurrency.test.ts: ok');
  } finally {
    await prisma.$executeRawUnsafe(`ALTER TABLE "SubscriptionEvent" DISABLE TRIGGER "SubscriptionEvent_append_only"`);
    try {
      if (subscriptionId) {
        await prisma.subscriptionEvent.deleteMany({ where: { subscriptionId } });
        await prisma.activationCode.deleteMany({ where: { subscriptionId } });
        await prisma.subscription.deleteMany({ where: { id: subscriptionId } });
      }
      await prisma.subscriptionEvent.deleteMany({ where: { subscription: { companyId } } });
      await prisma.subscription.deleteMany({ where: { companyId } });
      await prisma.company.delete({ where: { id: companyId } }).catch(() => undefined);
    } finally {
      await prisma.$executeRawUnsafe(`ALTER TABLE "SubscriptionEvent" ENABLE TRIGGER "SubscriptionEvent_append_only"`);
      await prisma.$disconnect();
    }
  }
}

export default main();
