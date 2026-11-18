import { Prisma } from '@prisma/client';
import { recordActivity } from '../activity/record-activity';

type Db = Pick<Prisma.TransactionClient, 'company' | 'activityLog'>;

/**
 * Idempotent milestone: set Company.firstScanAt on the first successful OCR
 * for the company. Concurrent callers are safe via `WHERE firstScanAt IS NULL`.
 * Returns true when this caller recorded the milestone.
 */
export async function recordFirstSuccessfulScan(
  db: Db,
  input: {
    companyId: string;
    documentId: string;
    captureId: string;
    now?: Date;
  },
): Promise<boolean> {
  const now = input.now ?? new Date();
  const updated = await db.company.updateMany({
    where: { id: input.companyId, firstScanAt: null },
    data: { firstScanAt: now },
  });
  if (updated.count !== 1) {
    return false;
  }

  await recordActivity(
    db,
    { id: null, companyId: input.companyId, name: 'system' },
    {
      entityType: 'Company',
      entityId: input.companyId,
      action: 'FIRST_SCAN',
      label: 'First successful invoice scan',
      metadata: {
        kind: 'first_scan',
        documentId: input.documentId,
        captureId: input.captureId,
      },
    },
  );
  return true;
}
