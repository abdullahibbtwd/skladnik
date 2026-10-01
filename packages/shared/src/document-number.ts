/**
 * Normalise a printed document number for duplicate detection (SKL-09).
 * Same supplier + type + normalised number is a duplicate; different suppliers may share a number.
 *
 * Steps: trim → lowercase → strip inner whitespace → drop "-", "/", "." → strip leading zeros.
 */
export function normalizeDocumentNumber(raw: string): string {
  const cleaned = raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[-/.]/g, '')
    .replace(/^0+/, '');
  return cleaned || '0';
}

/** True when two numbers collide after normalisation (case, spaces, separators, leading zeros). */
export function documentNumbersMatch(a: string, b: string): boolean {
  return normalizeDocumentNumber(a) === normalizeDocumentNumber(b);
}
