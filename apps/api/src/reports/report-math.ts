import { addDays, daysBetween } from '../sales/business-day';

export type PeriodGrouping = 'day' | 'week' | 'month';

export const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
export const round3 = (value: number) => Math.round((value + Number.EPSILON) * 1000) / 1000;
export const round4 = (value: number) => Math.round((value + Number.EPSILON) * 10000) / 10000;

/** ISO 8601 week, e.g. 2026-W01 can start in late December. */
export function isoWeek(date: string) {
  const day = new Date(`${date}T00:00:00Z`);
  const weekday = day.getUTCDay() || 7;
  day.setUTCDate(day.getUTCDate() + 4 - weekday);
  const year = day.getUTCFullYear();
  const week = Math.ceil(((day.getTime() - Date.UTC(year, 0, 1)) / 86_400_000 + 1) / 7);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

export function periodKey(date: string, by: PeriodGrouping) {
  if (by === 'day') return date;
  if (by === 'month') return date.slice(0, 7);
  return isoWeek(date);
}

/** Every bucket from..to in order, so days or weeks with no sales still show as zero rows. */
export function periodKeys(from: string, to: string, by: PeriodGrouping) {
  const keys: string[] = [];
  const length = daysBetween(from, to);
  for (let offset = 0; offset <= length; offset += 1) {
    const key = periodKey(addDays(from, offset), by);
    if (keys[keys.length - 1] !== key) keys.push(key);
  }
  return keys;
}

/**
 * ACC-03 / ACC-10: ONE VAT rounding rule for the whole app.
 *
 * Sales (gross includes VAT): base = round(gross / (1 + rate/100), 2), vat = gross − base.
 * That guarantees base + vat === gross to the cent for every receipt × rate bucket.
 * Purchases: prefer printed per-rate amounts from the document header; otherwise the same rule
 * applied to line nets (see documentTotals).
 *
 * Confirm this with the company accountant before changing.
 */
export function splitGross(gross: number, rate: number): { net: number; vat: number } {
  const roundedGross = round2(gross);
  if (!(roundedGross > 0) || !(rate > 0)) {
    return { net: roundedGross, vat: 0 };
  }
  const net = round2(roundedGross / (1 + rate / 100));
  return { net, vat: round2(roundedGross - net) };
}

/** 20 → "20", 4.5 → "4.5"; used in per-rate column keys such as net_20. */
export function rateKey(rate: number) {
  return String(Number(rate.toFixed(2)));
}

export type ExpiryStatus = 'expired' | 'within7' | 'within30' | 'ok' | 'noExpiry';

export function expiryStatus(daysLeft: number | null): ExpiryStatus {
  if (daysLeft === null) return 'noExpiry';
  if (daysLeft < 0) return 'expired';
  if (daysLeft <= 7) return 'within7';
  if (daysLeft <= 30) return 'within30';
  return 'ok';
}

/** Gross margin: profit as a share of revenue without VAT; null when there is no revenue. */
export function marginPercent(net: number, profit: number) {
  return net > 0 ? Math.round((profit / net) * 1000) / 10 : null;
}

/** Share of a total in percent with one decimal; null unless the total is positive (e.g. a loss-making period's profit). */
export function sharePercent(part: number, total: number) {
  return total > 0 ? Math.round((part / total) * 1000) / 10 : null;
}

/** Biggest first by `metric`, ties by name, then the first `limit`. */
export function rankBy<T extends { name: string }>(rows: T[], metric: (row: T) => number, limit: number) {
  return [...rows].sort((a, b) => metric(b) - metric(a) || a.name.localeCompare(b.name)).slice(0, limit);
}

/** Running balance after each signed quantity, starting from `opening`. */
export function runningBalances(opening: number, changes: number[]) {
  let balance = opening;
  return changes.map((change) => {
    balance = round3(balance + change);
    return balance;
  });
}

/** Adds numeric fields of `from` into `into`, creating them as needed. */
export function addInto<K extends string>(into: Partial<Record<K, number>>, from: Partial<Record<K, number>>) {
  for (const key of Object.keys(from) as K[]) into[key] = (into[key] ?? 0) + (from[key] ?? 0);
  return into;
}
