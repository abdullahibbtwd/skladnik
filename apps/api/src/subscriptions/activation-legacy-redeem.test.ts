/**
 * Regression: legacy PENDING codes hashed with a trailing "=" check symbol
 * must still redeem after normalize strips "=".
 * Requires DATABASE_URL (Postgres). Skips cleanly when the DB is unreachable.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'crypto';
import * as bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';
import {
  activationCodeHashCandidates,
  hashActivationCode,
  issueLegacyActivationCodeEndingWithEquals,
  normalizeActivationCode,
} from './activation-code';
import { redeemActivationCodeAtomic } from './redeem-activation';

const pepper = process.env.ACTIVATION_CODE_PEPPER ?? 'dev-activation-code-pepper-change-me';

async function main() {
  const prisma = new PrismaClient();
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    console.log('activation-legacy-redeem.test.ts: skipped (database unreachable)');
    await prisma.$disconnect();
    return;
  }

  const companyId = randomUUID();
  const userId = randomUUID();
  const passwordHash = await bcrypt.hash('LegacyRedeemTest1!', 4);
  let subscriptionId = '';

  try {
    await prisma.company.create({
      data: {
        id: companyId,
        name: `Legacy Redeem ${companyId.slice(0, 8)}`,
        users: {
          create: {
            id: userId,
            email: `legacy-${companyId.slice(0, 8)}@example.com`,
            name: 'Legacy Owner',
            role: 'OWNER',
            passwordHash,
          },
        },
      },
    });

    const legacy = issueLegacyActivationCodeEndingWithEquals(pepper);
    assert.ok(legacy.normalized.endsWith('='));
    assert.equal(hashActivationCode(legacy.normalized, pepper), legacy.codeHash);

    // Simulate user typing without "=" (and with spaces / lower case).
    const typed = `  ${legacy.plaintext.replace(/=/g, '').toLowerCase().replace(/-/g, ' ')}  `;
    const normalized = normalizeActivationCode(typed);
    assert.ok(!normalized.includes('='));
    const candidates = activationCodeHashCandidates(normalized, pepper);
    assert.ok(candidates.includes(legacy.codeHash));

    const subscription = await prisma.subscription.create({
      data: {
        plan: 'STARTER',
        status: 'PENDING',
        maxUsers: 5,
        termMonths: 12,
        activationCodes: {
          create: {
            codeHash: legacy.codeHash,
            codePrefix: legacy.codePrefix,
            expiresAt: legacy.expiresAt,
          },
        },
      },
    });
    subscriptionId = subscription.id;

    const result = await prisma.$transaction((tx) =>
      redeemActivationCodeAtomic(tx, {
        codeHash: legacy.codeHash,
        companyId,
        userId,
      }),
    );
    assert.ok(result, 'legacy PENDING code with = must redeem');
    assert.equal(result.subscriptionId, subscription.id);

    const code = await prisma.activationCode.findUniqueOrThrow({ where: { codeHash: legacy.codeHash } });
    assert.ok(code.redeemedAt);

    // Second attempt classification (service maps this to CODE_ALREADY_USED).
    const again = await prisma.activationCode.findFirst({
      where: { codeHash: { in: candidates } },
      select: { redeemedAt: true },
    });
    assert.ok(again?.redeemedAt, 'used code must be visible via hash candidates');
  } finally {
    if (subscriptionId) {
      await prisma.subscriptionEvent.deleteMany({ where: { subscriptionId } });
      await prisma.activationCode.deleteMany({ where: { subscriptionId } });
      await prisma.subscription.deleteMany({ where: { id: subscriptionId } });
    }
    await prisma.user.deleteMany({ where: { companyId } });
    await prisma.company.deleteMany({ where: { id: companyId } }).catch(() => undefined);
    await prisma.$disconnect();
  }

  console.log('activation-legacy-redeem.test.ts: ok');
}

export default main();
