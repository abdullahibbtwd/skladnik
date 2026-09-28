import { encodeWindows1251 } from '../reports/export/csv';

/**
 * Fixed-width text records for regulatory upload files: no separators, text left-aligned and padded
 * with spaces, numbers right-aligned, every record ends with CR LF, Windows-1251 bytes.
 */
export type FixedFieldKind = 'text' | 'amount' | 'int' | 'coefficient';

export type FixedField = { code: string; width: number; kind: FixedFieldKind };

export type FixedValue = string | number | null | undefined;

export class FieldOverflowError extends Error {
  constructor(
    readonly code: string,
    readonly value: string,
    readonly width: number,
  ) {
    super(`Field ${code}: "${value}" does not fit in ${width} characters`);
  }
}

/** Line breaks and tabs would break the record; runs of spaces are collapsed. */
function cleanText(value: string) {
  return value.replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
}

export function formatAmount(value: number) {
  const rounded = Math.round((value + Number.EPSILON * Math.sign(value)) * 100) / 100;
  return (Object.is(rounded, -0) || rounded === 0 ? 0 : rounded).toFixed(2);
}

/** Text longer than the field is cut (names, descriptions); numbers that don't fit throw. */
export function formatField(field: FixedField, value: FixedValue) {
  if (field.kind === 'text') return cleanText(value === null || value === undefined ? '' : String(value)).slice(0, field.width).padEnd(field.width, ' ');
  const text =
    field.kind === 'amount'
      ? formatAmount(Number(value ?? 0))
      : field.kind === 'coefficient'
        ? Number(value ?? 0).toFixed(2)
        : String(Math.trunc(Number(value ?? 0)));
  if (text.length > field.width) throw new FieldOverflowError(field.code, text, field.width);
  return text.padStart(field.width, ' ');
}

export function fixedRecord(fields: readonly FixedField[], values: Record<string, FixedValue>) {
  return fields.map((field) => formatField(field, values[field.code])).join('');
}

export function recordWidth(fields: readonly FixedField[]) {
  return fields.reduce((sum, field) => sum + field.width, 0);
}

export function fixedWidthFile(records: string[]) {
  return encodeWindows1251(records.map((record) => `${record}\r\n`).join(''));
}

/** Would the text be cut when written into the field? */
export function isShortened(field: FixedField, value: string | null | undefined) {
  return field.kind === 'text' && cleanText(value ?? '').length > field.width;
}
