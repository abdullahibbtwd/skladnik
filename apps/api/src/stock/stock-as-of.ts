/**
 * ACC-07: stock as of a calendar date (Europe/Sofia business day end exclusive).
 * All stock-value / slow-mover / batch reports and screens should use this helper
 * so movements dated after the as-of date are ignored.
 */
export function stockAsOfEnd(date: string): Date {
  // Movements with occurredAt < end-of-day+1 (exclusive upper bound).
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1));
}
