export function parseOcrDate(raw: string | null | undefined): Date | null {
  if (!raw?.trim()) return null;
  const text = raw.trim();

  const iso = text.match(/(\d{4})[./-](\d{1,2})[./-](\d{1,2})/);
  if (iso) {
    const date = utcDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
    if (date) return date;
  }

  const dayFirst = text.match(/(\d{1,2})[./-](\d{1,2})[./-](\d{4})/);
  if (dayFirst) {
    const date = utcDate(Number(dayFirst[3]), Number(dayFirst[2]), Number(dayFirst[1]));
    if (date) return date;
  }

  // Only for spelled-out months ("15 Sep 2026"): Date() reads bare digit runs such as an
  // invoice number "0000123" as a year.
  if (!/\p{L}{3,}/u.test(text)) return null;
  const native = new Date(text);
  if (Number.isNaN(native.getTime())) return null;
  return utcDate(native.getFullYear(), native.getMonth() + 1, native.getDate());
}

export function cleanDocumentNumber(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  let text = raw.trim().replace(/^[№Nº#]\s*/u, '');
  const withPrintedDate = text.match(/^(.*)\s+\/\s+(\d{1,2}[./-]\d{1,2}[./-]\d{4}\S*)\s*$/);
  if (withPrintedDate && parseOcrDate(withPrintedDate[2])) {
    text = withPrintedDate[1];
  }
  return text.trim() || null;
}

/** Invoice and expiry dates; anything outside this range is a misread. */
const MIN_YEAR = 2000;
const MAX_YEAR = 2100;

function utcDate(year: number, month: number, day: number) {
  if (year < MIN_YEAR || year > MAX_YEAR) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    Number.isNaN(date.getTime()) ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}
