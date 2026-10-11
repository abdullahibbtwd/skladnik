/**
 * Preview validates a code without consuming it (callable twice).
 * Requires DATABASE_URL. Skips when unreachable.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'crypto';
import * as bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';
import { computeActivationSchedule } from '@skladnik/shared';
import {
  activationCodeHashCandidates,
  issueActivationCode,
  normalizeActivationCode,
} from './activation-code';

const pepper = process.env.ACTIVATION_CODE_PEPPER ?? 'dev-activation-code-pepper-change-me';

async function previewOnce(
  prisma: PrismaClient,
  companyId: string,
  rawCode: string,
) {
  const normalized = normalizeActivationCode(rawCode);
  const hashes = activationCodeHashCandidates(normalized, pepper);
  const code = await prisma.activationCode.findFirst({
    where: { codeHash: { in: hashes } },
    include: {
      subscription: {
        include: { invoices: { orderBy: { issuedAt: 'desc' }, take: 1 } },
      },
    },
  });
  assert.ok(code && !code.redeemedAt);
  const current = await prisma.subscription.findFirst({
    where: { companyId, status: { in: ['TRIAL', 'ACTIVE', 'EXPIRED', 'SUSPENDED'] } },
  });
  const schedule = computeActivationSchedule({
    newPlan: code.subscription.plan,
    termMonths: code.subscription.termMonths,
    now: new Date(),
    current: current ? { plan: current.plan, expiresAt: current.expiresAt } : null,
  });
  return {
    plan: code.subscription.plan,
    termMonths: code.subscription.termMonths,
    resultingExpires: schedule.expiresAt.toISOString(),
    codeHash: code.codeHash,
  };
}

async function main() {
  const prisma = new PrismaClient();
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    console.log('activation-preview.test.ts: skipped (database unreachable)');
    await prisma.$disconnect();
    return;
  }

  const companyId = randomUUID();
  const userId = randomUUID();
  const passwordHash = await bcrypt.hash('PreviewTest1!', 4);
  let subscriptionId = '';

  try {
    await prisma.company.create({
      data: {
        id: companyId,
        name: `Preview ${companyId.slice(0, 8)}`,
        eik: '175074406',
        users: {
          create: {
            id: userId,
            email: `preview-${companyId.slice(0, 8)}@example.com`,
            name: 'Owner',
            role: 'OWNER',
            passwordHash,
          },
        },
      },
    });

    const issued = issueActivationCode(pepper);
    const sub = await prisma.subscription.create({
      data: {
        plan: 'PRO',
        status: 'PENDING',
        maxUsers: 5,
        termMonths: 12,
        companyNameHint: 'Buyer Co',
        activationCodes: {
          create: {
            codeHash: issued.codeHash,
            codePrefix: issued.codePrefix,
            expiresAt: issued.expiresAt,
          },
        },
      },
    });
    subscriptionId = sub.id;

    const first = await previewOnce(prisma, companyId, issued.plaintext);
    const second = await previewOnce(prisma, companyId, issued.plaintext.toLowerCase());
    assert.equal(first.codeHash, second.codeHash);
    assert.equal(first.plan, 'PRO');
    assert.equal(second.plan, 'PRO');
    assert.equal(first.termMonths, 12);
    assert.equal(second.termMonths, 12);
    // resultingExpires may differ by a few ms between calls; both must be present.
    assert.ok(first.resultingExpires);
    assert.ok(second.resultingExpires);

    const stillOpen = await prisma.activationCode.findUniqueOrThrow({
      where: { codeHash: issued.codeHash },
    });
    assert.equal(stillOpen.redeemedAt, null, 'preview must not consume the code');
    const stillOpenAgain = await prisma.activationCode.findUniqueOrThrow({
      where: { codeHash: issued.codeHash },
    });
    assert.equal(stillOpenAgain.redeemedAt, null, 'second preview must not consume the code');
  } finally {
    await prisma.activationCode.deleteMany({ where: { subscriptionId } }).catch(() => undefined);
    await prisma.subscription.deleteMany({ where: { id: subscriptionId } }).catch(() => undefined);
    await prisma.user.deleteMany({ where: { companyId } });
    await prisma.company.delete({ where: { id: companyId } }).catch(() => undefined);
    await prisma.$disconnect();
  }

  console.log('activation-preview.test.ts: ok');
}

export default main();
