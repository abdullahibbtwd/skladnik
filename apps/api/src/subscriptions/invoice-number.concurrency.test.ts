/**
 * Concurrent invoice number allocation: unique, gapless within the Sofia year.
 * Requires DATABASE_URL after invoice migrations. Skips when DB/table unavailable.
 * Cleans up created rows so the platform list stays free of test junk.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { formatInvoiceNumber, takeInvoiceNumber } from './invoice-number';
import { seriesCalendarYear } from '../company/document-series';

async function main() {
  const prisma = new PrismaClient();
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    console.log('invoice-number.concurrency.test.ts: skipped (database unreachable)');
    await prisma.$disconnect();
    return;
  }

  const tables = await prisma.$queryRaw<Array<{ exists: boolean }>>`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'InvoiceNumberCounter'
    ) AS exists
  `;
  if (!tables[0]?.exists) {
    console.log('invoice-number.concurrency.test.ts: skipped (InvoiceNumberCounter not migrated)');
    await prisma.$disconnect();
    return;
  }

  const year = seriesCalendarYear();
  const concurrency = 8;
  const subscriptionIds: string[] = [];

  try {
    const before = await prisma.invoiceNumberCounter.findUnique({ where: { year } });
    const start = before?.nextNumber ?? 1;

    const results = await Promise.all(
      Array.from({ length: concurrency }, async () => {
        const subscriptionId = randomUUID();
        subscriptionIds.push(subscriptionId);
        return prisma.$transaction(async (tx) => {
          await tx.subscription.create({
            data: {
              id: subscriptionId,
              plan: 'STARTER',
              status: 'PENDING',
              maxUsers: 1,
              termMonths: 1,
              notes: '__invoice_number_concurrency_test__',
            },
          });
          const number = await takeInvoiceNumber(tx);
          await tx.invoice.create({
            data: {
              subscriptionId,
              number,
              title: 'Proforma invoice',
              status: 'ISSUED',
              currency: 'EUR',
              vatRate: 20,
              subtotalMinor: 100,
              vatMinor: 20,
              totalMinor: 120,
              lineItems: [{ description: 't', quantity: 1, unitMinor: 100, lineMinor: 100 }],
              sellerName: 'Seller',
              sellerEik: '1',
              sellerAddress: 'A',
              sellerEmail: 's@example.com',
              buyerName: 'Buyer',
              buyerEik: '2',
              buyerAddress: 'B',
              buyerEmail: 'b@example.com',
              issuedAt: new Date(),
            },
          });
          return number;
        });
      }),
    );

    assert.equal(new Set(results).size, concurrency, 'numbers must be unique');
    const seqs = results
      .map((n) => {
        const m = /^PI-\d{4}-(\d{6})$/.exec(n);
        assert.ok(m, `bad number format: ${n}`);
        return Number(m![1]);
      })
      .sort((a, b) => a - b);

    for (let i = 0; i < seqs.length; i += 1) {
      assert.equal(seqs[i], start + i, 'numbers must be gapless');
    }
    assert.equal(results.includes(formatInvoiceNumber(year, start)), true);

    const after = await prisma.invoiceNumberCounter.findUniqueOrThrow({ where: { year } });
    assert.equal(after.nextNumber, start + concurrency);
  } finally {
    try {
      await prisma.$executeRaw`ALTER TABLE "Invoice" DISABLE TRIGGER "Invoice_immutability"`;
      await prisma.$executeRaw`ALTER TABLE "SubscriptionEvent" DISABLE TRIGGER "SubscriptionEvent_append_only"`;
      if (subscriptionIds.length) {
        await prisma.$executeRaw`
          DELETE FROM "Invoice" WHERE "subscriptionId" = ANY(${subscriptionIds}::text[])
        `;
        await prisma.$executeRaw`
          DELETE FROM "SubscriptionEvent" WHERE "subscriptionId" = ANY(${subscriptionIds}::text[])
        `;
        await prisma.$executeRaw`
          DELETE FROM "ActivationCode" WHERE "subscriptionId" = ANY(${subscriptionIds}::text[])
        `;
        await prisma.$executeRaw`
          DELETE FROM "Subscription" WHERE "id" = ANY(${subscriptionIds}::text[])
        `;
      }
      await prisma.$executeRaw`ALTER TABLE "SubscriptionEvent" ENABLE TRIGGER "SubscriptionEvent_append_only"`;
      await prisma.$executeRaw`ALTER TABLE "Invoice" ENABLE TRIGGER "Invoice_immutability"`;
    } catch (err) {
      console.warn('invoice-number.concurrency.test.ts: cleanup warning', err);
    }
    await prisma.$disconnect();
  }

  console.log('invoice-number.concurrency.test.ts: ok');
}

module.exports = main();
