import type { Prisma } from '@prisma/client';

const PREFIX = 'P-';

/** Next free P-00001 style code, for products created without one. */
export async function nextProductCode(tx: Prisma.TransactionClient, companyId: string): Promise<string> {
  const rows = await tx.product.findMany({
    where: { companyId, code: { startsWith: PREFIX } },
    select: { code: true },
  });
  const highest = rows.reduce((max, row) => {
    const match = /^P-(\d+)$/.exec(row.code);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return `${PREFIX}${String(highest + 1).padStart(5, '0')}`;
}
