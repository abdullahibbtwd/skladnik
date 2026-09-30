import { Prisma } from '@prisma/client';

type Db = Pick<Prisma.TransactionClient, 'activityLog'>;

export type Actor = { id: string | null; companyId: string; name?: string | null; email?: string | null };

export type ActivityInput = {
  entityType: string;
  entityId: string;
  action: string;
  /** Document number, product name… so the entry reads on its own. */
  label?: string | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
};

/** Decimals, dates and arrays compared and stored as plain JSON values. */
function plain(value: unknown): unknown {
  if (value === undefined) return null;
  if (value instanceof Prisma.Decimal) return value.toNumber();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(plain);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, inner]) => [key, plain(inner)]));
  }
  return value;
}

/**
 * The fields that differ between two versions of a record, with their old and new values.
 * `fields` limits the comparison (default: every key of `after`). null when nothing changed.
 */
export function changes(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  fields: readonly string[] = Object.keys(after),
): { before: Record<string, unknown>; after: Record<string, unknown> } | null {
  const was: Record<string, unknown> = {};
  const now: Record<string, unknown> = {};
  for (const field of fields) {
    if (!(field in after)) continue;
    const oldValue = plain(before[field]);
    const newValue = plain(after[field]);
    if (JSON.stringify(oldValue) === JSON.stringify(newValue)) continue;
    was[field] = oldValue;
    now[field] = newValue;
  }
  return Object.keys(now).length ? { before: was, after: now } : null;
}

const json = (value: Record<string, unknown> | null | undefined) =>
  value ? (plain(value) as Prisma.InputJsonValue) : Prisma.JsonNull;

/** Appends one entry. Pass the transaction client when the change itself runs in a transaction. */
export async function recordActivity(db: Db, actor: Actor, input: ActivityInput) {
  await db.activityLog.create({
    data: {
      companyId: actor.companyId,
      userId: actor.id,
      userName: actor.name || actor.email || null,
      entityType: input.entityType,
      entityId: input.entityId,
      entityLabel: input.label ?? null,
      action: input.action,
      before: json(input.before),
      after: json(input.after),
      metadata: json(input.metadata),
    },
  });
}
