#!/usr/bin/env node
/**
 * Regenerates src/i18n/locales/bg.json from en.json using google-translate-api-x.
 * Interpolation tokens like {{name}} are preserved.
 *
 *   npm run i18n:translate --workspace=@skladnik/web
 */
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { translate } from 'google-translate-api-x';

const root = dirname(fileURLToPath(import.meta.url));
const locales = resolve(root, '../src/i18n/locales');

function flatten(value, prefix = '', out = {}) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const [key, nested] of Object.entries(value)) {
      flatten(nested, prefix ? `${prefix}.${key}` : key, out);
    }
    return out;
  }
  out[prefix] = value;
  return out;
}

function unflatten(flat) {
  const tree = {};
  for (const [path, value] of Object.entries(flat)) {
    const parts = path.split('.');
    let cursor = tree;
    for (let i = 0; i < parts.length - 1; i += 1) {
      cursor[parts[i]] ??= {};
      cursor = cursor[parts[i]];
    }
    cursor[parts[parts.length - 1]] = value;
  }
  return tree;
}

function protect(text) {
  const tokens = [];
  const masked = String(text).replace(/\{\{[^}]+\}\}/g, (match) => {
    const index = tokens.push(match) - 1;
    return `⟨${index}⟩`;
  });
  return { masked, tokens };
}

function restore(text, tokens) {
  return String(text).replace(/⟨(\d+)⟩/g, (_, index) => tokens[Number(index)] ?? '');
}

const GLOSSARY = [
  [/Annex No\. 38/gi, 'Приложение № 38'],
  [/Annex 38/gi, 'Приложение № 38'],
  [/Skladnik/g, 'Skladnik'],
  [/FEFO/g, 'FEFO'],
  [/OCR/g, 'OCR'],
  [/POS/g, 'POS'],
  [/XML/g, 'XML'],
  [/SKU/g, 'SKU'],
];

async function main() {
  const en = JSON.parse(await readFile(resolve(locales, 'en.json'), 'utf8'));
  const flat = flatten(en);
  const keys = Object.keys(flat);
  const prepared = keys.map((key) => protect(flat[key]));
  const chunkSize = 40;
  const translated = [];

  for (let i = 0; i < prepared.length; i += chunkSize) {
    const chunk = prepared.slice(i, i + chunkSize).map((item) => item.masked);
    const result = await translate(chunk, { from: 'en', to: 'bg', forceBatch: true });
    const rows = Array.isArray(result) ? result : [result];
    translated.push(...rows.map((row) => row.text));
    process.stdout.write(`translated ${Math.min(i + chunkSize, prepared.length)}/${prepared.length}\n`);
  }

  const bgFlat = {};
  keys.forEach((key, index) => {
    let text = restore(translated[index] ?? flat[key], prepared[index].tokens);
    for (const [pattern, replacement] of GLOSSARY) {
      text = text.replace(pattern, replacement);
    }
    bgFlat[key] = text;
  });

  await writeFile(resolve(locales, 'bg.json'), `${JSON.stringify(unflatten(bgFlat), null, 2)}\n`);
  process.stdout.write('wrote src/i18n/locales/bg.json\n');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
