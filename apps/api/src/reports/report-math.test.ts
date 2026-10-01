import {
  expiryStatus,
  isoWeek,
  marginPercent,
  periodKey,
  periodKeys,
  rankBy,
  rateKey,
  round2,
  runningBalances,
  sharePercent,
  splitGross,
} from './report-math';

function expectEqual(actual: unknown, expected: unknown, label: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${label}: expected ${e}, got ${a}`);
}

// ISO weeks: Monday starts the week; the first week holds the year's first Thursday.
expectEqual(isoWeek('2026-09-28'), '2026-W40', 'monday');
expectEqual(isoWeek('2026-10-04'), '2026-W40', 'sunday stays in the same week');
expectEqual(isoWeek('2027-01-01'), '2026-W53', 'new year belongs to the last week');
expectEqual(isoWeek('2024-12-30'), '2025-W01', 'late december can be week 1');
expectEqual(periodKey('2026-09-28', 'month'), '2026-09', 'month key');

// Buckets cover the whole range, including empty days.
expectEqual(periodKeys('2026-09-28', '2026-10-02', 'day'), ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02'], 'days');
expectEqual(periodKeys('2026-09-20', '2026-10-05', 'week'), ['2026-W38', '2026-W39', '2026-W40', '2026-W41'], 'weeks');
expectEqual(periodKeys('2026-08-31', '2026-10-01', 'month'), ['2026-08', '2026-09', '2026-10'], 'months');

// VAT split of till prices (ACC-03: base rounded, vat = gross − base; always sums to gross).
const split = splitGross(12, 20);
expectEqual([split.net, split.vat], [10, 2], '20% VAT');
expectEqual(split.net + split.vat, 12, '20% sums to gross');
expectEqual(splitGross(10.9, 9), { net: 10, vat: 0.9 }, '9% VAT');
expectEqual(splitGross(10.9, 9).net + splitGross(10.9, 9).vat, 10.9, '9% sums to gross');
expectEqual([rateKey(20), rateKey(9.0), rateKey(4.5)], ['20', '9', '4.5'], 'rate keys');

expectEqual([expiryStatus(-1), expiryStatus(0), expiryStatus(7), expiryStatus(8), expiryStatus(31), expiryStatus(null)],
  ['expired', 'within7', 'within7', 'within30', 'ok', 'noExpiry'], 'expiry status');

expectEqual(marginPercent(10, 6.666), 66.7, 'margin');
expectEqual(marginPercent(0, 5), null, 'no revenue, no margin');
expectEqual(sharePercent(1, 3), 33.3, 'share');
expectEqual(sharePercent(1, 0), null, 'share of nothing');
expectEqual(sharePercent(-1, -3), null, 'no share of a loss');

const ranked = rankBy([{ name: 'b', v: 1 }, { name: 'a', v: 1 }, { name: 'c', v: 5 }], (row) => row.v, 2);
expectEqual(ranked.map((row) => row.name), ['c', 'a'], 'rank by metric then name');

expectEqual(runningBalances(2, [3, -1.1, -0.9]), [5, 3.9, 3], 'running balance');

console.log('report-math tests passed');
