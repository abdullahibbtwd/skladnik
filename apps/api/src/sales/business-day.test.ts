import { addDays, businessDate, businessHour, businessRange, dayStart, isBusinessDate } from './business-day';

function expectEqual(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

// Sofia is UTC+3 in summer, UTC+2 in winter.
expectEqual(dayStart('2026-07-01').toISOString(), '2026-06-30T21:00:00.000Z', 'summer midnight');
expectEqual(dayStart('2026-01-15').toISOString(), '2026-01-14T22:00:00.000Z', 'winter midnight');
// Clocks go forward at 03:00 on 29 Mar 2026 and back at 04:00 on 25 Oct 2026; midnight keeps the old offset.
expectEqual(dayStart('2026-03-29').toISOString(), '2026-03-28T22:00:00.000Z', 'DST start day');
expectEqual(dayStart('2026-10-25').toISOString(), '2026-10-24T21:00:00.000Z', 'DST end day');
{
  const range = businessRange('2026-10-25', '2026-10-25');
  expectEqual((range.end.getTime() - range.start.getTime()) / 3_600_000, 25, 'the DST end day has 25 hours');
}

expectEqual(businessDate(new Date('2026-09-28T22:30:00Z')), '2026-09-29', 'late evening UTC is the next local day');
expectEqual(businessDate(new Date('2026-09-28T20:59:59Z')), '2026-09-28', 'before local midnight');
expectEqual(businessHour(new Date('2026-09-28T06:15:00Z')), 9, 'local hour');

expectEqual(addDays('2026-02-28', 1), '2026-03-01', 'add a day across months');
expectEqual(isBusinessDate('2026-02-30'), false, 'invalid date');
expectEqual(isBusinessDate('2026-02-28'), true, 'valid date');

console.log('business-day tests passed');
