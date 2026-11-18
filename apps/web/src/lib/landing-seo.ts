import type { AppLang } from '../i18n';

export const SITE_ORIGIN = 'https://oborotix.com';

export function isLandingPath(pathname: string): boolean {
  return pathname === '/' || pathname === '/bg';
}

export function landingLangFromPath(pathname: string): AppLang | null {
  if (pathname === '/bg') return 'bg';
  if (pathname === '/') return 'en';
  return null;
}

export function landingPathForLang(lang: AppLang): string {
  return lang === 'bg' ? '/bg' : '/';
}

function setMeta(selector: string, content: string) {
  const el = document.querySelector(selector);
  if (el) el.setAttribute('content', content);
}

function upsertLink(attrs: { rel: string; href: string; hreflang?: string }) {
  const selector = attrs.hreflang
    ? `link[rel="${attrs.rel}"][hreflang="${attrs.hreflang}"]`
    : `link[rel="${attrs.rel}"]:not([hreflang])`;
  let el = document.querySelector(selector) as HTMLLinkElement | null;
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', attrs.rel);
    if (attrs.hreflang) el.setAttribute('hreflang', attrs.hreflang);
    document.head.appendChild(el);
  }
  el.setAttribute('href', attrs.href);
}

/** Sync document lang, title, description, canonical, hreflang, and OG/Twitter for landing. */
export function syncLandingSeo(input: {
  lang: AppLang;
  title: string;
  description: string;
}) {
  const { lang, title, description } = input;
  const path = landingPathForLang(lang);
  const url = `${SITE_ORIGIN}${path === '/' ? '/' : path}`;

  document.documentElement.lang = lang;
  document.title = title;

  setMeta('meta[name="description"]', description);
  setMeta('meta[property="og:title"]', title);
  setMeta('meta[property="og:description"]', description);
  setMeta('meta[property="og:url"]', url);
  setMeta('meta[property="og:image:alt"]', title);
  setMeta('meta[property="og:locale"]', lang === 'bg' ? 'bg_BG' : 'en_GB');
  setMeta('meta[name="twitter:title"]', title);
  setMeta('meta[name="twitter:description"]', description);

  upsertLink({ rel: 'canonical', href: url });
  upsertLink({ rel: 'alternate', hreflang: 'en', href: `${SITE_ORIGIN}/` });
  upsertLink({ rel: 'alternate', hreflang: 'bg', href: `${SITE_ORIGIN}/bg` });
  upsertLink({ rel: 'alternate', hreflang: 'x-default', href: `${SITE_ORIGIN}/` });
}
