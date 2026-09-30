import { Prisma } from '@prisma/client';
import type { CostBook } from '../stock/costing';

/**
 * Documents still in force: not reversed and not a reversal. A reversal is an internal correction, not a
 * tax document, so the VAT ledgers, purchase history and document reports leave out both halves.
 * (Till voids are SALE documents and are counted by the sales code, not filtered here.)
 */
export const STANDING_DOCUMENT = { reversalOfId: null, reversedBy: { is: null } } satisfies Prisma.DocumentWhereInput;

/** The same rule for SQL that aliases "Document" as d. */
export const STANDING_DOCUMENT_SQL = Prisma.sql`d."reversalOfId" IS NULL AND NOT EXISTS (SELECT 1 FROM "Document" r WHERE r."reversalOfId" = d."id")`;

/** "0000451201" is reversed by "0000451201-СТ" (сторно). */
export const REVERSAL_SUFFIX = '-СТ';

export type OriginalMovement = {
  id: string;
  siteId: string;
  documentLineId: string | null;
  productId: string;
  batchId: string | null;
  direction: 'IN' | 'OUT';
  quantity: number;
  unitCost: number | null;
};

export type PlannedMovement = Omit<OriginalMovement, 'id' | 'unitCost'> & { reversalOfId: string; unitCost: number };

const round3 = (value: number) => Math.round(value * 1000) / 1000;

/**
 * Every movement of the original gets its exact opposite: same site, product, batch, quantity and unit cost.
 * An undone IN also leaves the batch cost and the average (CostBook.unreceive); an undone OUT comes back at
 * the cost it left at. Stock that came in and has since been sold or moved can't be reversed.
 * `books` holds one CostBook per site, loaded under the site lock; they are updated in place.
 */
export function planReversal(
  movements: OriginalMovement[],
  books: Map<string, CostBook>,
  describe: (movement: OriginalMovement) => string,
): { movements: PlannedMovement[]; shortfalls: string[] } {
  // Put stock back before taking any out, so a stocktake's surplus and shortage lines can't block each other.
  const ordered = [...movements.filter((row) => row.direction === 'OUT'), ...movements.filter((row) => row.direction === 'IN')];
  const planned: PlannedMovement[] = [];
  const takenOut = new Map<string, { movement: OriginalMovement; quantity: number }>();

  for (const movement of ordered) {
    const book = books.get(movement.siteId);
    if (!book) throw new Error(`No cost book for site ${movement.siteId}`);
    const unitCost = movement.unitCost ?? book.unitCost(movement.productId, movement.batchId);
    if (movement.direction === 'OUT') {
      book.restore(movement.productId, movement.batchId, movement.quantity, unitCost);
    } else {
      book.unreceive(movement.productId, movement.batchId, movement.quantity, unitCost);
      const key = `${movement.siteId}\u0000${movement.productId}\u0000${movement.batchId ?? ''}`;
      const current = takenOut.get(key);
      takenOut.set(key, { movement, quantity: round3((current?.quantity ?? 0) + movement.quantity) });
    }
    planned.push({
      reversalOfId: movement.id,
      siteId: movement.siteId,
      documentLineId: movement.documentLineId,
      productId: movement.productId,
      batchId: movement.batchId,
      direction: movement.direction === 'IN' ? 'OUT' : 'IN',
      quantity: movement.quantity,
      unitCost,
    });
  }

  const shortfalls: string[] = [];
  for (const { movement, quantity } of takenOut.values()) {
    const book = books.get(movement.siteId)!;
    const left = movement.batchId === null ? book.onHand(movement.productId) : book.onHand(movement.productId, movement.batchId);
    if (left >= 0) continue;
    const available = Math.max(0, round3(left + quantity));
    shortfalls.push(`${describe(movement)}: ${quantity} came in on this document but only ${available} is left, the rest was sold or moved since`);
  }
  return { movements: planned, shortfalls };
}
