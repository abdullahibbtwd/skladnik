import { BUSINESS_TIME_ZONE } from '@skladnik/shared';
import { formatDateTime, formatDayHeading, formatTime } from './format';

const isoFormat = new Intl.DateTimeFormat('en-CA', { timeZone: BUSINESS_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' });

/** Today's YYYY-MM-DD in the business time zone, the same day the API reports on. */
export function businessToday(at = new Date()) {
  return isoFormat.format(at);
}

export function shiftDate(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function formatBusinessTime(iso: string, locale: string) {
  return formatTime(iso, locale);
}

export function formatBusinessDateTime(iso: string, locale: string) {
  return formatDateTime(iso, locale);
}

export function formatDay(date: string, locale: string) {
  return formatDayHeading(date, locale);
}
