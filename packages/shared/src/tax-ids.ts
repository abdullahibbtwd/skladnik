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

// ─── Partner and company registration numbers ───────────────────────────────

export type TaxIdField = 'eik' | 'vatNumber';
export type TaxIdProblemCode = 'EIK_FORMAT' | 'EIK_CHECKSUM' | 'VAT_FORMAT' | 'VAT_CHECKSUM' | 'VAT_EIK_MISMATCH';
export type TaxIdProblem = { field: TaxIdField; code: TaxIdProblemCode; value: string };

/** "BG 123-456-786" → "BG123456786". A bare 9–10 digit number is taken as Bulgarian. */
export function normaliseVatNumber(value: string | null | undefined) {
  const clean = normaliseTaxId(value);
  return /^\d{9,10}$/.test(clean) ? `BG${clean}` : clean;
}

/** An ЕИК / БУЛСТАТ, or the ЕГН / ЛНЧ of a sole trader or private person. Digits only. */
export function normaliseEik(value: string | null | undefined) {
  return normaliseTaxId(value).replace(/^BG/, '');
}

function eikProblem(eik: string): TaxIdProblemCode | null {
  if (/^\d{9}$|^\d{13}$/.test(eik)) return isValidEik(eik) ? null : 'EIK_CHECKSUM';
  if (/^\d{10}$/.test(eik)) return isValidEgn(eik) || isValidLnch(eik) ? null : 'EIK_CHECKSUM';
  return 'EIK_FORMAT';
}

function vatProblem(vat: string): TaxIdProblemCode | null {
  if (vat.startsWith('BG')) {
    if (!/^BG\d{9,10}$/.test(vat)) return 'VAT_FORMAT';
    return isValidBgVatNumber(vat) ? null : 'VAT_CHECKSUM';
  }
  return isPlausibleForeignVatNumber(vat) ? null : 'VAT_FORMAT';
}

/**
 * Checks both numbers of a partner or of the company, already normalised. A Bulgarian VAT number is
 * BG + the ЕИК (the first 9 digits of a 13-digit branch number), so the two must agree.
 */
export function taxIdProblems(ids: { eik?: string | null; vatNumber?: string | null }): TaxIdProblem[] {
  const problems: TaxIdProblem[] = [];
  const eik = ids.eik || null;
  const vat = ids.vatNumber || null;
  const eikCode = eik ? eikProblem(eik) : null;
  const vatCode = vat ? vatProblem(vat) : null;
  if (eik && eikCode) problems.push({ field: 'eik', code: eikCode, value: eik });
  if (vat && vatCode) problems.push({ field: 'vatNumber', code: vatCode, value: vat });
  if (eik && vat && !eikCode && !vatCode && vat.startsWith('BG')) {
    const base = eik.length === 13 ? eik.slice(0, 9) : eik;
    if (vat.slice(2) !== base) problems.push({ field: 'vatNumber', code: 'VAT_EIK_MISMATCH', value: vat });
  }
  return problems;
}

export function taxIdProblemMessage(problem: TaxIdProblem, owner?: string) {
  const who = owner ? `${owner}: ` : '';
  switch (problem.code) {
    case 'EIK_FORMAT':
      return `${who}ЕИК ${problem.value} must be 9 or 13 digits (or a 10-digit ЕГН / ЛНЧ)`;
    case 'EIK_CHECKSUM':
      return `${who}ЕИК ${problem.value} fails the checksum; check it against the registration`;
    case 'VAT_FORMAT':
      return `${who}VAT number ${problem.value} is not a valid format (BG + 9 or 10 digits, or an EU VAT number)`;
    case 'VAT_CHECKSUM':
      return `${who}VAT number ${problem.value} fails the checksum; check it against the registration`;
    case 'VAT_EIK_MISMATCH':
      return `${who}VAT number ${problem.value} doesn't match the ЕИК`;
  }
}

/** The number written for a counterparty: the VAT number when registered, else the ЕИК / ЕГН. */
export function partnerTaxNumber(partner: { eik: string | null; vatNumber: string | null } | null | undefined) {
  return partner?.vatNumber || partner?.eik || null;
}
