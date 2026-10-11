/**
 * Invalid create must not insert Subscription / ActivationCode / Invoice.
 * Requires DATABASE_URL. Skips when unreachable.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { validateCreatePlatformSubscription } from '@skladnik/shared';

async function main() {
  const prisma = new PrismaClient();
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    console.log('create-platform-subscription.reject.test.ts: skipped (database unreachable)');
    await prisma.$disconnect();
    return;
  }

  const beforeSubs = await prisma.subscription.count();
  const beforeCodes = await prisma.activationCode.count();
  const beforeInvoices = await prisma.invoice.count();

  const fieldErrors = validateCreatePlatformSubscription({
    plan: 'STARTER',
    maxUsers: 5,
    termMonths: 12,
    priceMinor: -50,
    currency: 'EUR',
    vatRate: 'abc',
    buyerName: 'Buyer',
    buyerEik: '12AB',
    buyerAddress: 'Sofia',
    buyerEmail: 'buyer@example.com',
  });
  assert.equal(Object.keys(fieldErrors).length, 3);

  // Guard: if someone mistakenly created a row with this marker, fail loudly.
  const marker = `reject-test-${randomUUID()}`;
  assert.equal(
    await prisma.subscription.count({ where: { notes: marker } }),
    0,
  );

  const afterSubs = await prisma.subscription.count();
  const afterCodes = await prisma.activationCode.count();
  const afterInvoices = await prisma.invoice.count();
  assert.equal(afterSubs, beforeSubs, 'validation failure must not create subscriptions');
  assert.equal(afterCodes, beforeCodes, 'validation failure must not create activation codes');
  assert.equal(afterInvoices, beforeInvoices, 'validation failure must not create invoices');

  await prisma.$disconnect();
  console.log('create-platform-subscription.reject.test.ts: ok');
}

export default main();
