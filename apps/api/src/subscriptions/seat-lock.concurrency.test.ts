/**
 * Concurrent seat claims: with maxUsers = seatsUsed+1, exactly one of two
 * parallel accepts may create a user. Requires DATABASE_URL (Postgres).
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'crypto';
import * as bcrypt from 'bcrypt';
import { HttpException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { assertSeatAvailable } from './seat-lock';

async function main() {
  const prisma = new PrismaClient();
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    console.log('seat-lock.concurrency.test.ts: skipped (database unreachable)');
    await prisma.$disconnect();
    return;
  }

  const companyId = randomUUID();
  const ownerId = randomUUID();
  const passwordHash = await bcrypt.hash('SeatLockTest1!', 4);

  try {
    await prisma.company.create({
      data: {
        id: companyId,
        name: `Seat Lock Co ${companyId.slice(0, 8)}`,
        users: {
          create: {
            id: ownerId,
            email: `owner-${companyId.slice(0, 8)}@example.com`,
            name: 'Owner',
            role: 'OWNER',
            passwordHash,
          },
        },
        subscriptions: {
          create: {
            plan: 'STARTER',
            status: 'ACTIVE',
            maxUsers: 2,
            termMonths: 12,
            startsAt: new Date(),
            expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          },
        },
      },
    });

    const claim = async (label: string) => {
      return prisma.$transaction(async (tx) => {
        await assertSeatAvailable(tx, companyId);
        return tx.user.create({
          data: {
            email: `${label}-${companyId.slice(0, 8)}@example.com`,
            name: label,
            role: 'STAFF',
            passwordHash,
            companyId,
          },
        });
      });
    };

    const results = await Promise.allSettled([claim('a'), claim('b')]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    assert.equal(fulfilled.length, 1, `expected one seat winner, got ${JSON.stringify(results)}`);
    assert.equal(rejected.length, 1, 'expected one seat rejection');

    const err = (rejected[0] as PromiseRejectedResult).reason;
    assert.ok(err instanceof HttpException, 'rejection should be HttpException');
    assert.equal(err.getStatus(), 402);
    const body = err.getResponse() as { code?: string };
    assert.equal(body.code, 'SUBSCRIPTION_SEAT_LIMIT');

    const seats = await prisma.user.count({ where: { companyId, isActive: true } });
    assert.equal(seats, 2, 'owner + one invitee');

    console.log('seat-lock.concurrency.test.ts: ok');
  } finally {
    await prisma.$executeRawUnsafe(`ALTER TABLE "SubscriptionEvent" DISABLE TRIGGER "SubscriptionEvent_append_only"`);
    try {
      await prisma.user.deleteMany({ where: { companyId } });
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
