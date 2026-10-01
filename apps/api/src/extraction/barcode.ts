/**
 * EAN/GTIN barcode length + check-digit validation (SKL-06).
 * Invalid barcodes must not be used for product matching and must be flagged low-confidence.
 * Digits are never auto-trimmed or "fixed".
 */

export type BarcodeCheck = {
  raw: string;
  digits: string;
  valid: boolean;
  /** Why it failed, when invalid. */
  reason: 'EMPTY' | 'LENGTH' | 'CHECKSUM' | null;
};

export function digitsOnly(value: string) {
  return value.replace(/\D/g, '');
}

/** GS1 check digit for EAN-8 / UPC-A (12) / EAN-13 / GTIN-14. */
export function gtinCheckDigit(bodyWithoutCheck: string): number {
  const digits = [...bodyWithoutCheck].map(Number);
  // Weights alternate from the right: odd positions (1-based from right) ×3.
  let sum = 0;
  for (let i = 0; i < digits.length; i += 1) {
    const fromRight = digits.length - i;
    sum += digits[i]! * (fromRight % 2 === 0 ? 1 : 3);
  }
  return (10 - (sum % 10)) % 10;
}

export function isValidGtin(digits: string): boolean {
  if (![8, 12, 13, 14].includes(digits.length)) return false;
  if (!/^\d+$/.test(digits)) return false;
  const body = digits.slice(0, -1);
  const check = Number(digits.slice(-1));
  return gtinCheckDigit(body) === check;
}

export function validateBarcode(raw: string | null | undefined): BarcodeCheck {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return { raw: '', digits: '', valid: false, reason: 'EMPTY' };
  const digits = digitsOnly(trimmed);
  if (![8, 12, 13, 14].includes(digits.length)) {
    return { raw: trimmed, digits, valid: false, reason: 'LENGTH' };
  }
  if (!isValidGtin(digits)) {
    return { raw: trimmed, digits, valid: false, reason: 'CHECKSUM' };
  }
  return { raw: trimmed, digits, valid: true, reason: null };
}

/** Matching only uses a barcode that passes length + checksum. */
export function barcodeForMatching(raw: string | null | undefined): string | null {
  const check = validateBarcode(raw);
  return check.valid ? check.digits : null;
}
