// Cancels legacy "SCAN-…" drafts that never received a photo or a line: before Scan went
// camera-first, opening the scanner created the document even when the user backed out.
//   DATABASE_URL=… node scripts/cleanup-empty-scans.mjs          # dry run, lists what would change
//   DATABASE_URL=… node scripts/cleanup-empty-scans.mjs --apply  # cancels them
import { PrismaClient } from '@prisma/client';

const apply = process.argv.includes('--apply');
// Leave anything recent alone in case an upload is still in flight.
const olderThan = new Date(Date.now() - 60 * 60 * 1000);

const prisma = new PrismaClient();

try {
  const empty = await prisma.document.findMany({
    where: {
      number: { startsWith: 'SCAN-' },
      status: 'DRAFT',
      createdAt: { lt: olderThan },
      captures: { none: {} },
      lines: { none: {} },
    },
    select: { id: true, companyId: true, number: true, createdAt: true, company: { select: { name: true } } },
    orderBy: { createdAt: 'asc' },
  });

  for (const doc of empty) {
    console.log(`${apply ? 'cancel' : 'would cancel'}  ${doc.company.name}  ${doc.number}  ${doc.createdAt.toISOString()}`);
  }

  if (apply && empty.length > 0) {
    await prisma.$transaction(async (tx) => {
      const { count } = await tx.document.updateMany({
        where: { id: { in: empty.map((doc) => doc.id) }, status: 'DRAFT', captures: { none: {} }, lines: { none: {} } },
        data: { status: 'CANCELLED' },
      });
      await tx.activityLog.createMany({
        data: empty.map((doc) => ({
          companyId: doc.companyId,
          userId: null,
          entityType: 'Document',
          entityId: doc.id,
          action: 'CANCEL',
          metadata: { number: doc.number, reason: 'empty-scan-cleanup' },
        })),
      });
      console.log(`Cancelled ${count} empty scan draft(s).`);
    });
  } else {
    console.log(`${empty.length} empty scan draft(s)${!apply && empty.length ? '. Re-run with --apply to cancel them' : ''}.`);
  }
} finally {
  await prisma.$disconnect();
}
