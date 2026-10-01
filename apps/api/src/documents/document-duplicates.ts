import type { DocumentType, Prisma } from '@prisma/client';
import { normalizeDocumentNumber } from '@skladnik/shared';
import { STANDING_DOCUMENT } from './reversal';

export type DuplicateKey = {
  companyId: string;
  partnerId: string | null;
  type: DocumentType;
  number: string;
  /** The document being edited, which is never its own duplicate. */
  excludeId?: string;
};

/**
 * Suppliers number their paperwork independently, so a number repeats only within one partner and
 * document type. Cancelled and reversed documents don't count: re-entering one of them is legitimate.
 *
 * SKL-09: compare on numberKey (trim, case-insensitive, no inner spaces/separators, no leading zeros).
 */
export function findDuplicateDocument(db: Prisma.TransactionClient, key: DuplicateKey) {
  const numberKey = normalizeDocumentNumber(key.number);
  return db.document.findFirst({
    where: {
      companyId: key.companyId,
      partnerId: key.partnerId,
      type: key.type,
      numberKey,
      status: { not: 'CANCELLED' },
      ...STANDING_DOCUMENT,
      ...(key.excludeId ? { id: { not: key.excludeId } } : {}),
    },
    select: { id: true, number: true, type: true, status: true, issuedOn: true, partner: { select: { name: true } } },
    orderBy: { createdAt: 'asc' },
  });
}

export type DuplicateDocument = NonNullable<Awaited<ReturnType<typeof findDuplicateDocument>>>;

/** Serialises writers of the same normalised number so the check-then-write above can't race. */
export async function lockDocumentNumber(tx: Prisma.TransactionClient, companyId: string, number: string) {
  const numberKey = normalizeDocumentNumber(number);
  await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtext(${`document-number:${companyId}:${numberKey}`}))`;
}
