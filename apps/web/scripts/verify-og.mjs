/**
 * Verify prerendered landing HTML has language-correct OG / canonical tags.
 * Run after `npm run build` (or build:spa + prerender).
 *
 * Usage: node scripts/verify-og.mjs
 */
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = join(dirname(fileURLToPath(import.meta.url)), '../dist');

function attr(html, selectorHint) {
  // Very small matcher for content="..." near a unique attribute fragment.
  const re = new RegExp(`${selectorHint}[^>]*content="([^"]*)"`, 'i');
  const m = html.match(re);
  if (m) return m[1];
  const re2 = new RegExp(`content="([^"]*)"[^>]*${selectorHint}`, 'i');
  return html.match(re2)?.[1] ?? null;
}

function must(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function check(file, expect) {
  const html = await readFile(join(dist, file), 'utf8');
  const title = html.match(/<title>([^<]*)<\/title>/i)?.[1] ?? '';
  const ogTitle = attr(html, 'property="og:title"');
  const ogDesc = attr(html, 'property="og:description"');
  const ogUrl = attr(html, 'property="og:url"');
  const ogLocale = attr(html, 'property="og:locale"');
  const ogImage = attr(html, 'property="og:image"');
  const canonical = html.match(/rel="canonical"[^>]*href="([^"]+)"/i)?.[1]
    ?? html.match(/href="([^"]+)"[^>]*rel="canonical"/i)?.[1];

  must(title.includes(expect.titlePart) || title.includes(expect.titlePartAlt ?? expect.titlePart), `${file}: title missing ${expect.titlePart}`);
  must(ogTitle && (ogTitle.includes(expect.titlePart) || ogTitle.includes(expect.titlePartAlt ?? expect.titlePart)), `${file}: og:title`);
  must(ogDesc && ogDesc.length > 20, `${file}: og:description`);
  must(ogUrl === expect.url, `${file}: og:url got ${ogUrl}`);
  must(ogLocale === expect.locale, `${file}: og:locale got ${ogLocale}`);
  must(ogImage && ogImage.startsWith('https://oborotix.com/'), `${file}: og:image`);
  must(canonical === expect.url, `${file}: canonical got ${canonical}`);
  must(html.includes('hreflang="en"') && html.includes('hreflang="bg"') && html.includes('hreflang="x-default"'), `${file}: hreflang`);
  must(html.includes('SoftwareApplication'), `${file}: JSON-LD`);
  console.log(`ok ${file}`);
}

await check('index.html', {
  titlePart: 'Smart Retail',
  url: 'https://oborotix.com/',
  locale: 'en_GB',
});
await check('bg/index.html', {
  titlePart: 'Складова',
  titlePartAlt: '&#x421;&#x43A;&#x43B;&#x430;&#x434;&#x43E;&#x432;&#x430;',
  url: 'https://oborotix.com/bg',
  locale: 'bg_BG',
});

console.log('verify-og.mjs: ok');
