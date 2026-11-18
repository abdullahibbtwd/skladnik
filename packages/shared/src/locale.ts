/** Supported UI / transactional-email locales. */
export const APP_LOCALES = ['en', 'bg'] as const;
export type AppLocale = (typeof APP_LOCALES)[number];

export const DEFAULT_APP_LOCALE: AppLocale = 'en';

/** Whitelist `en` | `bg`; anything else falls back to English. */
export function parseAppLocale(value: unknown): AppLocale {
  if (typeof value === 'string') {
    const normalised = value.trim().toLowerCase();
    if ((APP_LOCALES as readonly string[]).includes(normalised)) {
      return normalised as AppLocale;
    }
    if (normalised.startsWith('bg')) return 'bg';
  }
  return DEFAULT_APP_LOCALE;
}
