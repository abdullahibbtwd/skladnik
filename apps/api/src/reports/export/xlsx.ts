import type { ReportCell, ReportColumnType } from '@skladnik/shared';
import { zipToBuffer } from './zip';

export type XlsxColumn = { header: string; type: ReportColumnType };

export type XlsxSheet = {
  sheetName: string;
  /** Lines above the table: title first, then scope (site, period, generated). */
  heading: string[];
  columns: XlsxColumn[];
  rows: ReportCell[][];
  /** Indexes into `rows` shown bold, e.g. section subtotals. */
  boldRows?: number[];
  totals: ReportCell[] | null;
  notes: string[];
  /** Number format for date cells, e.g. dd.mm.yyyy. */
  dateFormat: string;
};

const TYPES: ReportColumnType[] = ['text', 'date', 'int', 'qty', 'price', 'money', 'percent'];
const TITLE_STYLE = TYPES.length * 2;

/** cellXfs index: two per type (plain, bold), then the title style. */
function styleOf(type: ReportColumnType, bold: boolean) {
  return TYPES.indexOf(type) * 2 + (bold ? 1 : 0);
}

function escapeXml(text: string) {
  return text
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function columnName(index: number) {
  let name = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  return name;
}

/** Days since 1899-12-30, Excel's (1900-leap-bug-compatible) epoch. */
function excelDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  return (Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) - Date.UTC(1899, 11, 30)) / 86_400_000;
}

function cell(ref: string, value: ReportCell, type: ReportColumnType, style: number) {
  if (value === null || value === undefined || value === '') return `<c r="${ref}" s="${style}"/>`;
  if (typeof value === 'number' && Number.isFinite(value)) return `<c r="${ref}" s="${style}"><v>${value}</v></c>`;
  if (type === 'date' && typeof value === 'string') {
    const serial = excelDate(value);
    if (serial !== null) return `<c r="${ref}" s="${style}"><v>${serial}</v></c>`;
  }
  const text = String(value);
  const space = text !== text.trim() ? ' xml:space="preserve"' : '';
  return `<c r="${ref}" t="inlineStr" s="${style}"><is><t${space}>${escapeXml(text)}</t></is></c>`;
}

function textRow(rowNumber: number, text: string, style: number) {
  return `<row r="${rowNumber}">${cell(`A${rowNumber}`, text, 'text', style)}</row>`;
}

function stylesXml(dateFormat: string) {
  // qty stays General: "#,##0.###" would print whole numbers as "5."
  const formats: Record<ReportColumnType, number> = { text: 0, date: 167, int: 1, qty: 0, price: 165, money: 164, percent: 166 };
  const xfs = TYPES.flatMap((type) =>
    [0, 1].map(
      (font) =>
        `<xf numFmtId="${formats[type]}" fontId="${font}" fillId="0" borderId="0" xfId="0"${formats[type] ? ' applyNumberFormat="1"' : ''}${font ? ' applyFont="1"' : ''}/>`,
    ),
  );
  xfs.push('<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>');
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<numFmts count="4">' +
    '<numFmt numFmtId="164" formatCode="#,##0.00"/>' +
    '<numFmt numFmtId="165" formatCode="#,##0.00##"/>' +
    '<numFmt numFmtId="166" formatCode="0.0"/>' +
    `<numFmt numFmtId="167" formatCode="${escapeXml(dateFormat)}"/>` +
    '</numFmts>' +
    '<fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font>' +
    '<font><b/><sz val="14"/><name val="Calibri"/></font></fonts>' +
    '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
    '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    `<cellXfs count="${xfs.length}">${xfs.join('')}</cellXfs>` +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
    '</styleSheet>'
  );
}

function widthOf(column: XlsxColumn, rows: ReportCell[][], index: number) {
  const longest = rows.slice(0, 500).reduce((max, row) => Math.max(max, String(row[index] ?? '').length), column.header.length);
  const minimum = column.type === 'date' ? 11 : column.type === 'text' ? 8 : 10;
  return Math.min(60, Math.max(minimum, longest + 2));
}

function sheetXml(sheet: XlsxSheet) {
  const rows: string[] = [];
  let rowNumber = 0;
  sheet.heading.forEach((line, index) => rows.push(textRow(++rowNumber, line, index === 0 ? TITLE_STYLE : styleOf('text', false))));
  if (sheet.heading.length) rowNumber += 1;

  const headerRow = ++rowNumber;
  rows.push(
    `<row r="${headerRow}">${sheet.columns
      .map((column, index) => cell(`${columnName(index)}${headerRow}`, column.header, 'text', styleOf('text', true)))
      .join('')}</row>`,
  );
  const dataRow = (values: ReportCell[], bold: boolean) => {
    const current = ++rowNumber;
    return `<row r="${current}">${sheet.columns
      .map((column, index) => cell(`${columnName(index)}${current}`, values[index] ?? null, column.type, styleOf(column.type, bold)))
      .join('')}</row>`;
  };
  const bold = new Set(sheet.boldRows ?? []);
  sheet.rows.forEach((values, index) => rows.push(dataRow(values, bold.has(index))));
  if (sheet.totals) rows.push(dataRow(sheet.totals, true));
  if (sheet.notes.length) rowNumber += 1;
  for (const note of sheet.notes) rows.push(textRow(++rowNumber, note, styleOf('text', false)));

  const cols = sheet.columns
    .map((column, index) => `<col min="${index + 1}" max="${index + 1}" width="${widthOf(column, sheet.rows, index)}" customWidth="1"/>`)
    .join('');
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${headerRow}" topLeftCell="A${headerRow + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` +
    `<cols>${cols}</cols>` +
    `<sheetData>${rows.join('')}</sheetData>` +
    '<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/>' +
    '<pageSetup orientation="landscape" paperSize="9" fitToWidth="1" fitToHeight="0"/>' +
    '</worksheet>'
  );
}

/** Excel sheet names: ≤ 31 characters, none of : \ / ? * [ ]. */
export function safeSheetName(name: string) {
  return name.replace(/[:\\/?*[\]]/g, ' ').slice(0, 31).trim() || 'Report';
}

export function buildXlsx(sheet: XlsxSheet) {
  const name = escapeXml(safeSheetName(sheet.sheetName));
  return zipToBuffer([
    {
      name: '[Content_Types].xml',
      data: Buffer.from(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
          '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
          '<Default Extension="xml" ContentType="application/xml"/>' +
          '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
          '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
          '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
          '</Types>',
      ),
    },
    {
      name: '_rels/.rels',
      data: Buffer.from(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
          '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
          '</Relationships>',
      ),
    },
    {
      name: 'xl/workbook.xml',
      data: Buffer.from(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
          `<sheets><sheet name="${name}" sheetId="1" r:id="rId1"/></sheets>` +
          '</workbook>',
      ),
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      data: Buffer.from(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
          '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
          '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
          '</Relationships>',
      ),
    },
    { name: 'xl/styles.xml', data: Buffer.from(stylesXml(sheet.dateFormat)) },
    { name: 'xl/worksheets/sheet1.xml', data: Buffer.from(sheetXml(sheet)) },
  ]);
}
