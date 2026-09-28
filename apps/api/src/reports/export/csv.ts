import type { CsvFormat, ReportCell, ReportColumnType } from '@skladnik/shared';
import { cellText } from './cells';

export type CsvColumn = { header: string; type: ReportColumnType };

/** Windows-1251 bytes 0x80–0xBF; 0xC0–0xFF are А–я (U+0410–U+044F) in order. */
const CP1251_HIGH = [
  0x0402, 0x0403, 0x201a, 0x0453, 0x201e, 0x2026, 0x2020, 0x2021, 0x20ac, 0x2030, 0x0409, 0x2039, 0x040a, 0x040c, 0x040b, 0x040f,
  0x0452, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, -1, 0x2122, 0x0459, 0x203a, 0x045a, 0x045c, 0x045b, 0x045f,
  0x00a0, 0x040e, 0x045e, 0x0408, 0x00a4, 0x0490, 0x00a6, 0x00a7, 0x0401, 0x00a9, 0x0404, 0x00ab, 0x00ac, 0x00ad, 0x00ae, 0x0407,
  0x00b0, 0x00b1, 0x0406, 0x0456, 0x0491, 0x00b5, 0x00b6, 0x00b7, 0x0451, 0x2116, 0x0454, 0x00bb, 0x0458, 0x0405, 0x0455, 0x0457,
];
const CP1251_BY_CODE = new Map(CP1251_HIGH.flatMap((code, index) => (code < 0 ? [] : [[code, 0x80 + index] as const])));

/** Characters Windows-1251 can't hold become `?`, as Windows itself does. */
export function encodeWindows1251(text: string) {
  const bytes = Buffer.alloc(text.length);
  let length = 0;
  for (const char of text) {
    const code = char.codePointAt(0)!;
    if (code < 0x80) bytes[length] = code;
    else if (code >= 0x0410 && code <= 0x044f) bytes[length] = code - 0x0410 + 0xc0;
    else bytes[length] = CP1251_BY_CODE.get(code) ?? 0x3f;
    length += 1;
  }
  return bytes.subarray(0, length);
}

/** Leading = + @ would run as a formula when the file is opened in a spreadsheet. */
function neutralise(text: string) {
  return /^[=+@\t\r]/.test(text) ? `'${text}` : text;
}

function quote(text: string, delimiter: string) {
  return text.includes(delimiter) || /["\r\n]/.test(text) || text !== text.trim() ? `"${text.replace(/"/g, '""')}"` : text;
}

export function buildCsv(columns: CsvColumn[], rows: ReportCell[][], format: CsvFormat) {
  const lines: string[] = [];
  if (format.includeHeader) lines.push(columns.map((column) => quote(neutralise(column.header), format.delimiter)).join(format.delimiter));
  for (const row of rows) {
    lines.push(
      columns
        .map((column, index) => {
          const text = cellText(row[index] ?? null, column.type, format);
          return quote(column.type === 'text' ? neutralise(text) : text, format.delimiter);
        })
        .join(format.delimiter),
    );
  }
  const text = `${lines.join('\r\n')}\r\n`;
  if (format.encoding === 'WINDOWS_1251') return encodeWindows1251(text);
  return Buffer.from(format.encoding === 'UTF8_BOM' ? `\uFEFF${text}` : text, 'utf8');
}
