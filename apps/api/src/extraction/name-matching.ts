/** Bulgarian official transliteration (2009), plus the Russian letters OCR sometimes produces. */
const CYRILLIC_TO_LATIN: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm',
  н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh',
  щ: 'sht', ъ: 'a', ь: 'y', ю: 'yu', я: 'ya', ы: 'y', э: 'e', ё: 'yo', ѝ: 'i',
};

const LEGAL_FORMS = new Set(['eood', 'ood', 'et', 'ad', 'ead', 'sd', 'kd', 'kda', 'ltd', 'llc', 'gmbh', 'srl']);

/**
 * Case-, spacing-, punctuation- and script-insensitive form of a name.
 * Transliterating to Latin also folds OCR's mix of look-alike Latin and Cyrillic letters ("OMK" vs "ОМК").
 */
export function nameKey(value: string): string {
  const lower = value.normalize('NFKC').toLowerCase();
  const latin = Array.from(lower, (ch) => CYRILLIC_TO_LATIN[ch] ?? ch).join('');
  return latin
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/(\d),(\d)/g, '$1.$2')
    .replace(/[^a-z0-9.]+/g, ' ')
    .replace(/\.(?!\d)|(?<!\d)\./g, ' ')
    .replace(/(\d)([a-z])/g, '$1 $2')
    .replace(/([a-z])(\d)/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim();
}

/** nameKey without legal-form tokens, so `ЕТ "Иван Петров"` and `Ivan Petrov ET` agree. */
export function partnerKey(value: string): string {
  return nameKey(value)
    .split(' ')
    .filter((token) => token && !LEGAL_FORMS.has(token))
    .join(' ');
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    previous = current;
  }
  return previous[b.length];
}

function ratio(a: string, b: string) {
  const longest = Math.max(a.length, b.length);
  return longest === 0 ? 1 : 1 - levenshtein(a, b) / longest;
}

const sortTokens = (key: string) => key.split(' ').sort().join(' ');
const numbersIn = (key: string) => (key.match(/\d+(?:\.\d+)?/g) ?? []).join(' ');

type Entry<T> = { item: T; key: string; sorted: string; numbers: string };

/**
 * Finds an existing record by name. Exact key first; otherwise the closest key above `threshold`,
 * only among names with exactly the same numbers (400 g never matches 500 g). Ties return null:
 * a duplicate pending record is recoverable, a wrong merge silently corrupts stock.
 */
export class NameIndex<T extends { name: string }> {
  private readonly entries: Entry<T>[] = [];

  constructor(
    items: T[],
    private readonly keyOf: (name: string) => string = nameKey,
    private readonly threshold = 0.88,
  ) {
    for (const item of items) this.add(item);
  }

  add(item: T) {
    const key = this.keyOf(item.name);
    if (key) this.entries.push({ item, key, sorted: sortTokens(key), numbers: numbersIn(key) });
  }

  find(name: string): T | null {
    const key = this.keyOf(name);
    if (!key) return null;
    const exact = this.entries.find((entry) => entry.key === key);
    if (exact) return exact.item;
    if (key.length < 6) return null;

    const sorted = sortTokens(key);
    const numbers = numbersIn(key);
    let best: Entry<T> | null = null;
    let bestScore = 0;
    let tied = false;
    for (const entry of this.entries) {
      if (entry.numbers !== numbers) continue;
      if (Math.abs(entry.key.length - key.length) / Math.max(entry.key.length, key.length) > 1 - this.threshold) continue;
      const score = Math.max(ratio(key, entry.key), ratio(sorted, entry.sorted));
      if (score > bestScore) {
        best = entry;
        bestScore = score;
        tied = false;
      } else if (score === bestScore && best) {
        tied = true;
      }
    }
    return best && bestScore >= this.threshold && !tied ? best.item : null;
  }
}
