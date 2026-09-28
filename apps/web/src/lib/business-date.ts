import { BUSINESS_TIME_ZONE } from '@skladnik/shared';

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
  return new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', timeZone: BUSINESS_TIME_ZONE }).format(new Date(iso));
}

export function formatBusinessDateTime(iso: string, locale: string) {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: BUSINESS_TIME_ZONE }).format(new Date(iso));
}

export function formatDay(date: string, locale: string) {
  return new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));
}
