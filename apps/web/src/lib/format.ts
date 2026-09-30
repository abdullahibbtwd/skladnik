import { BUSINESS_TIME_ZONE } from '@skladnik/shared';
import i18n from '../i18n';

/** App UI locale: Bulgarian uses bg-BG (DD.MM.YYYY, decimal comma). */
export function appLocale(lang = i18n.language): string {
  return lang?.toLowerCase().startsWith('bg') ? 'bg-BG' : 'en-GB';
}

export function isBg(lang = i18n.language) {
  return lang?.toLowerCase().startsWith('bg');
}

const dateCache = new Map<string, Intl.DateTimeFormat>();
const dateTimeCache = new Map<string, Intl.DateTimeFormat>();
const timeCache = new Map<string, Intl.DateTimeFormat>();
const dayCache = new Map<string, Intl.DateTimeFormat>();
const shortDayCache = new Map<string, Intl.DateTimeFormat>();

function cached(map: Map<string, Intl.DateTimeFormat>, key: string, build: () => Intl.DateTimeFormat) {
  const existing = map.get(key);
  if (existing) return existing;
  const created = build();
  map.set(key, created);
  return created;
}

/** Calendar date YYYY-MM-DD → DD.MM.YYYY (bg) / DD/MM/YYYY (en). */
export function formatDate(value: string | null | undefined, lang?: string) {
  if (!value) return '';
  const day = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return value;
  const locale = appLocale(lang);
  return cached(dateCache, locale, () =>
    new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' }),
  ).format(new Date(`${day}T00:00:00Z`));
}

/** Instant → date + time in the business time zone. */
export function formatDateTime(iso: string, lang?: string) {
  const locale = appLocale(lang);
  return cached(dateTimeCache, locale, () =>
    new Intl.DateTimeFormat(locale, {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: BUSINESS_TIME_ZONE,
    }),
  ).format(new Date(iso));
}

export function formatTime(iso: string, lang?: string) {
  const locale = appLocale(lang);
  return cached(timeCache, locale, () =>
    new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', timeZone: BUSINESS_TIME_ZONE }),
  ).format(new Date(iso));
}

/** Weekday + day + month for a calendar date (sales day header). */
export function formatDayHeading(date: string, lang?: string) {
  const locale = appLocale(lang);
  return cached(dayCache, locale, () =>
    new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'long', timeZone: 'UTC' }),
  ).format(new Date(`${date}T00:00:00Z`));
}

/** Compact day+month for lists (e.g. dashboard ops): 29.09 or 29 Sep. */
export function formatShortDay(date: string, lang?: string) {
  const day = date.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return '';
  const locale = appLocale(lang);
  if (isBg(lang)) return formatDate(day, lang).slice(0, 5); // DD.MM
  return cached(shortDayCache, locale, () =>
    new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' }),
  ).format(new Date(`${day}T00:00:00Z`));
}

export function formatQty(value: number, lang?: string, fractionDigits = 3) {
  return new Intl.NumberFormat(appLocale(lang), { maximumFractionDigits: fractionDigits }).format(value);
}

export function formatInt(value: number, lang?: string) {
  return new Intl.NumberFormat(appLocale(lang), { maximumFractionDigits: 0 }).format(value);
}

export function formatPrice(value: number, lang?: string) {
  return new Intl.NumberFormat(appLocale(lang), { minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(value);
}

export function formatMoney(value: number, lang?: string) {
  return new Intl.NumberFormat(appLocale(lang), { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

/** Bulgaria has used the euro since 1 Jan 2026. */
export function formatEuro(value: number, lang?: string) {
  const locale = isBg(lang) ? 'bg-BG' : 'en-IE';
  return new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR' }).format(value);
}

export function formatPercent(value: number, lang?: string) {
  return `${new Intl.NumberFormat(appLocale(lang), { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value)}%`;
}

/** Relative day count label: "3 д" / "3d". */
export function formatDaysLeft(days: number, lang?: string) {
  return isBg(lang) ? `${days} д` : `${days}d`;
}

/** Parse a typed DD.MM.YYYY (or D.M.YYYY) into YYYY-MM-DD, or null if invalid. */
export function parseDisplayDate(text: string): string | null {
  const match = text.trim().match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const iso = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const check = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(check.getTime()) || check.getUTCDate() !== day || check.getUTCMonth() + 1 !== month) return null;
  return iso;
}
