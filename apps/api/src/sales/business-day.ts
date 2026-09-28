import { BUSINESS_TIME_ZONE } from '@skladnik/shared';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parts(at: Date, timeZone: string) {
  const values = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
      .formatToParts(at)
      .map((part) => [part.type, part.value]),
  );
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second),
  };
}

/** Minutes the zone is ahead of UTC at this instant. */
function offsetMinutes(at: Date, timeZone: string) {
  const p = parts(at, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(at.getTime() / 1000) * 1000) / 60000);
}

export function isBusinessDate(value: string) {
  if (!DATE_RE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** The local calendar date (YYYY-MM-DD) of an instant. */
export function businessDate(at: Date = new Date(), timeZone = BUSINESS_TIME_ZONE) {
  const p = parts(at, timeZone);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/** Local hour (0–23) of an instant. */
export function businessHour(at: Date, timeZone = BUSINESS_TIME_ZONE) {
  return parts(at, timeZone).hour;
}

/** The instant local midnight starts on this date; correct across daylight-saving changes. */
export function dayStart(date: string, timeZone = BUSINESS_TIME_ZONE) {
  const [year, month, day] = date.split('-').map(Number);
  const guess = Date.UTC(year, month - 1, day);
  const first = offsetMinutes(new Date(guess), timeZone);
  let start = guess - first * 60000;
  const second = offsetMinutes(new Date(start), timeZone);
  if (second !== first) start = guess - second * 60000;
  return new Date(start);
}

export function addDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

/** [start, end) instants covering local dates from..to inclusive. */
export function businessRange(from: string, to: string, timeZone = BUSINESS_TIME_ZONE) {
  return { start: dayStart(from, timeZone), end: dayStart(addDays(to, 1), timeZone) };
}

export function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}
