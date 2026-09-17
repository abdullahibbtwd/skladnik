import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import bg from './locales/bg.json';

export const LANG_STORAGE_KEY = 'skladnik.lang';
export const SUPPORTED_LANGS = ['en', 'bg'] as const;
export type AppLang = (typeof SUPPORTED_LANGS)[number];

function storedLang(): AppLang | null {
  try {
    const value = localStorage.getItem(LANG_STORAGE_KEY);
    if (value === 'en' || value === 'bg') return value;
  } catch {
    // ignore
  }
  return null;
}

export function detectLang(): AppLang {
  const stored = storedLang();
  if (stored) return stored;
  const nav = typeof navigator !== 'undefined' ? navigator.language : 'en';
  return nav.toLowerCase().startsWith('bg') ? 'bg' : 'en';
}

export function persistLang(lang: AppLang) {
  try {
    localStorage.setItem(LANG_STORAGE_KEY, lang);
  } catch {
    // ignore
  }
  document.documentElement.lang = lang;
}

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    bg: { translation: bg },
  },
  lng: detectLang(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

i18n.on('languageChanged', (lng) => {
  persistLang(lng.startsWith('bg') ? 'bg' : 'en');
});

persistLang(i18n.language.startsWith('bg') ? 'bg' : 'en');

export default i18n;
