import type { Prisma } from '@prisma/client';

/**
 * Removes products a scan created for this document that were never reviewed and are no longer
 * used anywhere. With `detach`, this document's own lines are unlinked from them first
 * (used when the draft is cancelled).
 */
export async function deleteOrphanAutoProducts(
  tx: Prisma.TransactionClient,
  companyId: string,
  documentId: string,
  options: { detach?: boolean } = {},
): Promise<number> {
  const pending = await tx.product.findMany({
    where: { companyId, createdFromDocumentId: documentId, status: 'PENDING_REVIEW' },
    select: { id: true },
  });
  if (!pending.length) return 0;
  const ids = pending.map((product) => product.id);

  if (options.detach) {
    await tx.documentLine.updateMany({
      where: { companyId, documentId, productId: { in: ids } },
      data: { productId: null },
    });
  }

  const unused = await tx.product.findMany({
    where: {
      id: { in: ids },
      documentLines: { none: {} },
      stockMovements: { none: {} },
      batches: { none: {} },
      usedInRecipes: { none: {} },
    },
    select: { id: true },
  });
  if (!unused.length) return 0;
  const { count } = await tx.product.deleteMany({ where: { id: { in: unused.map((product) => product.id) } } });
  return count;
}
