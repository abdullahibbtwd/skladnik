/**
 * Local-dev cleanup: remove cancelled documents and obvious test/prove leftovers.
 * Keeps real SCAN-* work, write-offs like ПБ-*, stocktakes, transfers you care about.
 *
 *   DATABASE_URL=… node scripts/cleanup-junk-documents.mjs          # dry run
 *   DATABASE_URL=… node scripts/cleanup-junk-documents.mjs --apply  # delete
 */
import { PrismaClient } from '@prisma/client';

const apply = process.argv.includes('--apply');

/** Fake numbers left by prove scripts / QA guards (not real shop paperwork). */
const JUNK_NUMBER =
  /^(PROVE-|FUTURE-|QA-|EMPTY-|BATCHEQ-|PENDING-|NOSUP-|LATER-|UX-|PDF-|WO-APICHECK|WO-SHORT|STAFF-R-|TR2?-|d283$|34564yy$|ε0000310425$)/i;

const JUNK_PARTNER = /(Guard Supplier|Prove Supplier)/i;

const prisma = new PrismaClient();

function isJunkNumber(number) {
  return JUNK_NUMBER.test(number.trim());
}

async function main() {
  const candidates = await prisma.document.findMany({
    where: {
      OR: [
        { status: 'CANCELLED' },
        {
          status: { in: ['DRAFT', 'REVIEW'] },
          OR: [
            { number: { startsWith: 'PROVE-' } },
            { number: { startsWith: 'FUTURE-' } },
            { number: { startsWith: 'QA-' } },
            { number: { startsWith: 'EMPTY-' } },
            { number: { startsWith: 'BATCHEQ-' } },
            { number: { startsWith: 'PENDING-' } },
            { number: { startsWith: 'NOSUP-' } },
            { number: { startsWith: 'LATER-' } },
            { number: { startsWith: 'UX-' } },
            { number: { startsWith: 'PDF-' } },
            { number: { startsWith: 'WO-APICHECK' } },
            { number: { startsWith: 'WO-SHORT' } },
            { number: { startsWith: 'STAFF-R-' } },
            { partner: { name: { contains: 'Guard Supplier' } } },
            { partner: { name: { contains: 'Prove Supplier' } } },
          ],
        },
      ],
    },
    select: {
      id: true,
      companyId: true,
      number: true,
      status: true,
      type: true,
      createdAt: true,
      reversalOfId: true,
      company: { select: { name: true } },
      partner: { select: { name: true } },
      reversedBy: { select: { id: true } },
      _count: { select: { stockMovements: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  // Also catch odd junk numbers not covered by startsWith filters above.
  const extra = await prisma.document.findMany({
    where: {
      status: { in: ['DRAFT', 'REVIEW', 'CANCELLED'] },
      id: { notIn: candidates.map((doc) => doc.id) },
      OR: [{ number: { in: ['d283', '34564yy', 'ε0000310425', '0000123'] } }],
    },
    select: {
      id: true,
      companyId: true,
      number: true,
      status: true,
      type: true,
      createdAt: true,
      reversalOfId: true,
      company: { select: { name: true } },
      partner: { select: { name: true } },
      reversedBy: { select: { id: true } },
      _count: { select: { stockMovements: true } },
    },
  });

  const all = [...candidates, ...extra].filter((doc) => {
    if (doc.status === 'CANCELLED') return true;
    if (doc.status === 'DRAFT' || doc.status === 'REVIEW') {
      return isJunkNumber(doc.number) || JUNK_PARTNER.test(doc.partner?.name ?? '');
    }
    return false;
  });

  const deletable = [];
  const skipped = [];
  for (const doc of all) {
    // Never hard-delete a doc that still anchors a reversal or ledger rows we should keep.
    if (doc.reversedBy) {
      skipped.push({ doc, reason: 'has reversal pointing at it' });
      continue;
    }
    if (doc.status !== 'CANCELLED' && doc._count.stockMovements > 0) {
      skipped.push({ doc, reason: `${doc._count.stockMovements} stock movement(s)` });
      continue;
    }
    deletable.push(doc);
  }

  for (const doc of deletable) {
    const partner = doc.partner?.name ? ` · ${doc.partner.name}` : '';
    console.log(
      `${apply ? 'delete' : 'would delete'}  ${doc.company.name}  ${doc.status.padEnd(9)}  ${doc.number}${partner}`,
    );
  }
  for (const { doc, reason } of skipped) {
    console.log(`skip          ${doc.company.name}  ${doc.status.padEnd(9)}  ${doc.number}  (${reason})`);
  }

  if (!apply) {
    console.log(
      `\n${deletable.length} document(s) to delete, ${skipped.length} skipped.` +
        (deletable.length ? ' Re-run with --apply to delete them.' : ''),
    );
    return;
  }

  if (!deletable.length) {
    console.log('Nothing to delete.');
    return;
  }

  const ids = deletable.map((doc) => doc.id);

  await prisma.$transaction(async (tx) => {
    // Break optional FKs that would block delete.
    await tx.product.updateMany({
      where: { createdFromDocumentId: { in: ids } },
      data: { createdFromDocumentId: null },
    });
    await tx.stockMovement.updateMany({
      where: { documentId: { in: ids } },
      data: { documentId: null, documentLineId: null },
    });

    // Clear reversalOf on junk docs that reverse something else (rare for cancelled).
    await tx.document.updateMany({
      where: { id: { in: ids }, reversalOfId: { not: null } },
      data: { reversalOfId: null },
    });

    // Captures cascade from document; lines cascade too once sourceCapture is fine.
    await tx.documentLine.updateMany({
      where: { documentId: { in: ids } },
      data: { sourceCaptureId: null },
    });

    const { count } = await tx.document.deleteMany({ where: { id: { in: ids } } });

    await tx.activityLog.createMany({
      data: deletable.map((doc) => ({
        companyId: doc.companyId,
        userId: null,
        entityType: 'Document',
        entityId: doc.id,
        action: 'DELETE',
        metadata: { number: doc.number, status: doc.status, reason: 'junk-documents-cleanup' },
      })),
    });

    console.log(`\nDeleted ${count} document(s).`);
  });
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
