/**
 * Conservative parser for Bulgarian “Словом: …” euro amounts (ACC-04).
 * Returns null when the text cannot be parsed with high confidence — never invent a total.
 */

const ONES: Record<string, number> = {
  нула: 0,
  един: 1,
  една: 1,
  едно: 1,
  два: 2,
  две: 2,
  три: 3,
  четири: 4,
  пет: 5,
  шест: 6,
  седем: 7,
  осем: 8,
  девет: 9,
};

const TEENS: Record<string, number> = {
  десет: 10,
  единадесет: 11,
  дванадесет: 12,
  тринадесет: 13,
  четиринадесет: 14,
  петнадесет: 15,
  шестнадесет: 16,
  седемнадесет: 17,
  осемнадесет: 18,
  деветнадесет: 19,
};

const TENS: Record<string, number> = {
  двадесет: 20,
  тридесет: 30,
  четиридесет: 40,
  петдесет: 50,
  шестдесет: 60,
  седемдесет: 70,
  осемдесет: 80,
  деветдесет: 90,
};

const HUNDREDS: Record<string, number> = {
  сто: 100,
  двеста: 200,
  триста: 300,
  четиристотин: 400,
  петстотин: 500,
  шестстотин: 600,
  седемстотин: 700,
  осемстотин: 800,
  деветстотин: 900,
};

function normaliseWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[.,;:!?„“"']/g, ' ')
    .replace(/-/g, ' ')
    .split(/\s+/)
    .map((w) => w.trim())
    .filter(Boolean);
}

/** Parse a small integer phrase like "триста четиридесет и осем" → 348. */
function parseIntegerPhrase(words: string[]): number | null {
  let total = 0;
  let i = 0;
  while (i < words.length) {
    const w = words[i];
    if (w === 'и') {
      i += 1;
      continue;
    }
    if (w in HUNDREDS) {
      total += HUNDREDS[w];
      i += 1;
      continue;
    }
    if (w in TEENS) {
      total += TEENS[w];
      i += 1;
      continue;
    }
    if (w in TENS) {
      total += TENS[w];
      i += 1;
      continue;
    }
    if (w in ONES) {
      total += ONES[w];
      i += 1;
      continue;
    }
    // Unknown token — abort (conservative).
    return null;
  }
  return total;
}

/**
 * Extract and parse an amount after “Словом”. Supports forms like:
 * "Словом: триста четиридесет и осем евро и 42 ц."
 * "словом триста четиридесет и осем евро и четиридесет и два цента"
 */
export function parseBulgarianEuroAmountInWords(raw: string | null | undefined): number | null {
  if (!raw?.trim()) return null;
  const lower = raw.toLowerCase();
  const slovom = lower.search(/словом/);
  const text = slovom >= 0 ? lower.slice(slovom).replace(/^словом[:\s]*/i, '') : lower;

  const euroMatch = text.match(/^(.+?)\s+евро(?:\s+и\s+(.+?))?(?:\s*\.?$)/i);
  if (!euroMatch) return null;

  const eurosPart = euroMatch[1].trim();
  const centsPart = (euroMatch[2] ?? '').trim();

  const euroWords = normaliseWords(eurosPart).filter((w) => w !== 'евро');
  const euros = parseIntegerPhrase(euroWords);
  if (euros === null || euros < 0 || euros > 999_999) return null;

  let cents = 0;
  if (centsPart) {
    const digitCents = centsPart.match(/^(\d{1,2})\s*(?:ц|цент|цента|ст)?\.?$/i);
    if (digitCents) {
      cents = Number(digitCents[1]);
    } else {
      const centWords = normaliseWords(centsPart).filter((w) => !/^(ц|цент|цента|ст)\.?$/.test(w));
      const parsed = parseIntegerPhrase(centWords);
      if (parsed === null || parsed < 0 || parsed > 99) return null;
      cents = parsed;
    }
  }

  return Math.round((euros + cents / 100) * 100) / 100;
}
