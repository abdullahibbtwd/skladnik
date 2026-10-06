/**
 * DB-level invoice immutability + status-transition trigger tests.
 * Requires DATABASE_URL (Postgres) after migrations 20261018100000 + 20261018110000.
 * Skips cleanly when the DB is unreachable or Invoice table is missing.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    console.log('invoice-immutability.test.ts: skipped (database unreachable)');
    await prisma.$disconnect();
    return;
  }

  const tables = await prisma.$queryRaw<Array<{ exists: boolean }>>`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'Invoice'
    ) AS exists
  `;
  if (!tables[0]?.exists) {
    console.log('invoice-immutability.test.ts: skipped (Invoice table not migrated yet)');
    await prisma.$disconnect();
    return;
  }

  const subscriptionId = randomUUID();
  const invoiceId = randomUUID();

  try {
    await prisma.subscription.create({
      data: {
        id: subscriptionId,
        plan: 'STARTER',
        status: 'PENDING',
        maxUsers: 5,
        termMonths: 12,
      },
    });

    await prisma.$executeRaw`
      INSERT INTO "Invoice" (
        "id", "subscriptionId", "number", "title", "status", "currency",
        "vatRate", "subtotalMinor", "vatMinor", "totalMinor", "lineItems",
        "sellerName", "sellerEik", "sellerAddress", "sellerEmail",
        "buyerName", "buyerEik", "buyerAddress", "buyerEmail",
        "issuedAt", "version", "createdAt", "updatedAt"
      ) VALUES (
        ${invoiceId},
        ${subscriptionId},
        ${`PI-TEST-${invoiceId.slice(0, 8)}`},
        'Proforma invoice',
        'ISSUED'::"InvoiceStatus",
        'EUR',
        20.0000,
        10000,
        2000,
        12000,
        ${JSON.stringify([{ description: 'STARTER 12m', quantity: 1, unitMinor: 10000, lineMinor: 10000 }])}::jsonb,
        'Seller EOOD',
        '123456789',
        'Sofia',
        'seller@example.com',
        'Buyer OOD',
        '987654321',
        'Plovdiv',
        'buyer@example.com',
        CURRENT_TIMESTAMP,
        1,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      )
    `;

    // CHECK: total must equal subtotal + vat
    await assert.rejects(
      () =>
        prisma.$executeRaw`
          INSERT INTO "Invoice" (
            "id", "subscriptionId", "number", "title", "status", "currency",
            "vatRate", "subtotalMinor", "vatMinor", "totalMinor", "lineItems",
            "sellerName", "sellerEik", "sellerAddress", "sellerEmail",
            "buyerName", "buyerEik", "buyerAddress", "buyerEmail",
            "issuedAt", "version", "createdAt", "updatedAt"
          ) VALUES (
            ${randomUUID()},
            ${subscriptionId},
            ${`PI-BAD-${randomUUID().slice(0, 8)}`},
            'Proforma invoice',
            'ISSUED'::"InvoiceStatus",
            'EUR',
            20.0000,
            10000,
            2000,
            99999,
            '[]'::jsonb,
            'S', '1', 'A', 's@e.com',
            'B', '2', 'A', 'b@e.com',
            CURRENT_TIMESTAMP, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
          )
        `,
      /Invoice_total_equals_parts_check|check constraint/i,
      'mismatched total rejected by CHECK',
    );

    // Raw DELETE rejected
    await assert.rejects(
      () => prisma.$executeRaw`DELETE FROM "Invoice" WHERE "id" = ${invoiceId}`,
      /cannot be deleted/i,
      'DELETE rejected',
    );

    // Snapshot column UPDATE rejected
    await assert.rejects(
      () =>
        prisma.$executeRaw`
          UPDATE "Invoice" SET "buyerName" = 'Hacked', "updatedAt" = CURRENT_TIMESTAMP
          WHERE "id" = ${invoiceId}
        `,
      /immutable/i,
      'snapshot UPDATE rejected',
    );

    // ISSUED → PAID allowed
    await prisma.$executeRaw`
      UPDATE "Invoice"
      SET "status" = 'PAID'::"InvoiceStatus",
          "paidAt" = CURRENT_TIMESTAMP,
          "version" = "version" + 1,
          "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${invoiceId}
    `;
    const paid = await prisma.$queryRaw<Array<{ status: string }>>`
      SELECT "status"::text AS status FROM "Invoice" WHERE "id" = ${invoiceId}
    `;
    assert.equal(paid[0]?.status, 'PAID');

    // PAID → VOID rejected
    await assert.rejects(
      () =>
        prisma.$executeRaw`
          UPDATE "Invoice"
          SET "status" = 'VOID'::"InvoiceStatus",
              "paidAt" = NULL,
              "voidedAt" = CURRENT_TIMESTAMP,
              "version" = "version" + 1,
              "updatedAt" = CURRENT_TIMESTAMP
          WHERE "id" = ${invoiceId}
        `,
      /Invalid invoice status transition/i,
      'PAID → VOID rejected',
    );

    // Fresh ISSUED → VOID allowed
    const voidId = randomUUID();
    await prisma.$executeRaw`
      INSERT INTO "Invoice" (
        "id", "subscriptionId", "number", "title", "status", "currency",
        "vatRate", "subtotalMinor", "vatMinor", "totalMinor", "lineItems",
        "sellerName", "sellerEik", "sellerAddress", "sellerEmail",
        "buyerName", "buyerEik", "buyerAddress", "buyerEmail",
        "issuedAt", "version", "createdAt", "updatedAt"
      ) VALUES (
        ${voidId},
        ${subscriptionId},
        ${`PI-VOID-${voidId.slice(0, 8)}`},
        'Proforma invoice',
        'ISSUED'::"InvoiceStatus",
        'EUR',
        20.0000,
        5000,
        1000,
        6000,
        '[]'::jsonb,
        'S', '1', 'A', 's@e.com',
        'B', '2', 'A', 'b@e.com',
        CURRENT_TIMESTAMP, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
    `;
    await prisma.$executeRaw`
      UPDATE "Invoice"
      SET "status" = 'VOID'::"InvoiceStatus",
          "voidedAt" = CURRENT_TIMESTAMP,
          "version" = "version" + 1,
          "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${voidId}
    `;
    const voided = await prisma.$queryRaw<Array<{ status: string }>>`
      SELECT "status"::text AS status FROM "Invoice" WHERE "id" = ${voidId}
    `;
    assert.equal(voided[0]?.status, 'VOID');

    console.log('invoice-immutability.test.ts: ok');
  } finally {
    // Cleanup: pause invoice trigger to delete rows, then subscription (events may not exist).
    try {
      await prisma.$executeRaw`ALTER TABLE "Invoice" DISABLE TRIGGER "Invoice_immutability"`;
      await prisma.$executeRaw`DELETE FROM "Invoice" WHERE "subscriptionId" = ${subscriptionId}`;
      await prisma.$executeRaw`ALTER TABLE "Invoice" ENABLE TRIGGER "Invoice_immutability"`;
      await prisma.subscription.delete({ where: { id: subscriptionId } }).catch(() => undefined);
    } catch (err) {
      console.warn('invoice-immutability.test.ts: cleanup warning', err);
    }
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
