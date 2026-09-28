/**
 * Bulgarian identification numbers: ЕИК/БУЛСТАТ (9 or 13 digits), ЕГН and ЛНЧ (10 digits), and VAT
 * numbers (country prefix + number; for Bulgaria BG + ЕИК, ЕГН or ЛНЧ).
 */

const digits = (value: string) => [...value].map(Number);

export function isValidEik(value: string) {
  if (!/^\d{9}$|^\d{13}$/.test(value)) return false;
  const d = digits(value);
  let check = d.slice(0, 8).reduce((sum, digit, index) => sum + digit * (index + 1), 0) % 11;
  if (check === 10) check = d.slice(0, 8).reduce((sum, digit, index) => sum + digit * (index + 3), 0) % 11 % 10;
  if (check !== d[8]) return false;
  if (value.length === 9) return true;
  const tail = [d[8], d[9], d[10], d[11]];
  let branch = [2, 7, 3, 5].reduce((sum, weight, index) => sum + weight * tail[index], 0) % 11;
  if (branch === 10) branch = [4, 9, 5, 7].reduce((sum, weight, index) => sum + weight * tail[index], 0) % 11 % 10;
  return branch === d[12];
}

export function isValidEgn(value: string) {
  if (!/^\d{10}$/.test(value)) return false;
  const d = digits(value);
  const check = [2, 4, 8, 5, 10, 9, 7, 3, 6].reduce((sum, weight, index) => sum + weight * d[index], 0) % 11 % 10;
  return check === d[9];
}

export function isValidLnch(value: string) {
  if (!/^\d{10}$/.test(value)) return false;
  const d = digits(value);
  const check = [21, 19, 17, 13, 11, 9, 7, 3, 1].reduce((sum, weight, index) => sum + weight * d[index], 0) % 10;
  return check === d[9];
}

export function normaliseTaxId(value: string | null | undefined) {
  return (value ?? '').replace(/[\s.\-/]/g, '').toUpperCase();
}

/** BG + 9-digit ЕИК or 10-digit ЕГН / ЛНЧ. */
export function isValidBgVatNumber(value: string) {
  const match = /^BG(\d{9,10})$/.exec(value);
  if (!match) return false;
  const number = match[1];
  return number.length === 9 ? isValidEik(number) : isValidEgn(number) || isValidLnch(number);
}

/** Other EU VAT numbers are checked for shape only (country code + 2–13 letters or digits). */
export function isPlausibleForeignVatNumber(value: string) {
  return /^(AT|BE|CY|CZ|DE|DK|EE|EL|ES|FI|FR|HR|HU|IE|IT|LT|LU|LV|MT|NL|PL|PT|RO|SE|SI|SK|XI)[0-9A-Z]{2,13}$/.test(value);
}

export type LedgerTaxId = { value: string | null; valid: boolean; assumedBg: boolean };

/**
 * The counterparty number written in a ledger. A Bulgarian supplier that charged VAT is VAT-registered,
 * so a bare ЕИК / ЕГН becomes its VAT number (BG + number); otherwise the number stays as stored.
 */
export function ledgerTaxId(raw: string | null | undefined, chargedVat: boolean): LedgerTaxId {
  const value = normaliseTaxId(raw);
  if (!value) return { value: null, valid: false, assumedBg: false };
  if (value === '999999999999999') return { value, valid: true, assumedBg: false };
  if (/^\d{9,10}$/.test(value)) {
    const valid = value.length === 9 ? isValidEik(value) : isValidEgn(value) || isValidLnch(value);
    return chargedVat ? { value: `BG${value}`, valid, assumedBg: true } : { value, valid, assumedBg: false };
  }
  if (/^\d{13}$/.test(value)) return { value, valid: isValidEik(value), assumedBg: false };
  if (value.startsWith('BG')) return { value, valid: isValidBgVatNumber(value), assumedBg: false };
  return { value, valid: isPlausibleForeignVatNumber(value), assumedBg: false };
}
