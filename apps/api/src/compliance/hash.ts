import { createHash } from 'node:crypto';

export function sha256(data: Buffer | string) {
  return createHash('sha256').update(data).digest('hex');
}

/** Stable JSON (sorted keys) so the same books always hash the same. */
export function stableHash(value: unknown) {
  const sort = (input: unknown): unknown =>
    Array.isArray(input)
      ? input.map(sort)
      : input && typeof input === 'object'
        ? Object.fromEntries(Object.keys(input as object).sort().map((key) => [key, sort((input as Record<string, unknown>)[key])]))
        : input;
  return sha256(JSON.stringify(sort(value)));
}
