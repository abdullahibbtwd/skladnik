import type { ExportDateFormat, ReportCell, ReportColumnType } from '@skladnik/shared';

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function formatDate(value: string, format: ExportDateFormat) {
  const match = DATE_RE.exec(value);
  if (!match) return value;
  const [, year, month, day] = match;
  switch (format) {
    case 'DD.MM.YYYY':
      return `${day}.${month}.${year}`;
    case 'DD/MM/YYYY':
      return `${day}/${month}/${year}`;
    case 'MM/DD/YYYY':
      return `${month}/${day}/${year}`;
    default:
      return value;
  }
}

const DECIMALS: Partial<Record<ReportColumnType, { min: number; max: number }>> = {
  int: { min: 0, max: 0 },
  qty: { min: 0, max: 3 },
  price: { min: 2, max: 4 },
  money: { min: 2, max: 2 },
  percent: { min: 1, max: 1 },
};

/** Plain number text for files: no thousands separators, a fixed decimal mark, trailing zeros trimmed past `min`. */
export function formatNumber(value: number, type: ReportColumnType, decimalSeparator: string) {
  const places = DECIMALS[type] ?? { min: 0, max: 4 };
  let text = value.toFixed(places.max);
  if (places.max > places.min) {
    const [whole, fraction] = text.split('.');
    let trimmed = fraction.replace(/0+$/, '');
    if (trimmed.length < places.min) trimmed = fraction.slice(0, places.min);
    text = trimmed ? `${whole}.${trimmed}` : whole;
  }
  if (text === '-0' || /^-0\.0*$/.test(text)) text = text.slice(1);
  return decimalSeparator === '.' ? text : text.replace('.', decimalSeparator);
}

export function cellText(value: ReportCell, type: ReportColumnType, options: { decimalSeparator: string; dateFormat: ExportDateFormat }) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return formatNumber(value, type, options.decimalSeparator);
  if (type === 'date') return formatDate(value, options.dateFormat);
  return value;
}
