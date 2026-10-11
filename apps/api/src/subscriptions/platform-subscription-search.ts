import type { Prisma } from '@prisma/client';
import { activationCodePrefix, normalizeActivationCode } from './activation-code';

/**
 * Build OR clauses for platform subscription list search.
 * Activation-code queries use normalizeActivationCode so "H65Y-1" and "H65Y1" match
 * both legacy undashed prefixes and dashed prefixes.
 */
export function platformSubscriptionSearchOr(qRaw: string): Prisma.SubscriptionWhereInput[] {
  const q = qRaw.trim();
  if (!q) return [];

  const clauses: Prisma.SubscriptionWhereInput[] = [
    { companyNameHint: { contains: q, mode: 'insensitive' } },
    { contactEmail: { contains: q, mode: 'insensitive' } },
    { externalInvoiceRef: { contains: q, mode: 'insensitive' } },
    { notes: { contains: q, mode: 'insensitive' } },
    { company: { name: { contains: q, mode: 'insensitive' } } },
  ];

  const normalizedCode = normalizeActivationCode(q);
  if (normalizedCode) {
    const dashed = activationCodePrefix(normalizedCode);
    const prefixCandidates = new Set<string>([normalizedCode, dashed, q.toUpperCase()]);
    for (const candidate of prefixCandidates) {
      if (!candidate) continue;
      clauses.push({
        activationCodes: { some: { codePrefix: { startsWith: candidate, mode: 'insensitive' } } },
      });
    }
  }

  return clauses;
}

/** Empty-table kind for platform list UI + tests. */
export type PlatformSubscriptionsEmptyKind = 'empty' | 'no_results';

export function platformSubscriptionsEmptyKind(input: {
  rowCount: number;
  hasFilters: boolean;
}): PlatformSubscriptionsEmptyKind | null {
  if (input.rowCount > 0) return null;
  return input.hasFilters ? 'no_results' : 'empty';
}
