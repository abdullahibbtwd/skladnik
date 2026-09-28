import { inflateRawSync } from 'zlib';
import { DEFAULT_CSV_FORMAT } from '@skladnik/shared';
import { cellText, formatNumber } from './cells';
import { buildCsv, encodeWindows1251 } from './csv';
import { buildXlsx, safeSheetName } from './xlsx';
import { zipToBuffer } from './zip';

function expectEqual(actual: unknown, expected: unknown, label: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${label}: expected ${e}, got ${a}`);
}

/** Minimal reader: walks the central directory and inflates each entry. */
function readZip(buffer: Buffer) {
  const end = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = buffer.readUInt16LE(end + 10);
  let cursor = buffer.readUInt32LE(end + 16);
  const files: Record<string, string> = {};
  for (let index = 0; index < count; index += 1) {
    const method = buffer.readUInt16LE(cursor + 10);
    const size = buffer.readUInt32LE(cursor + 20);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const offset = buffer.readUInt32LE(cursor + 42);
    const name = buffer.toString('utf8', cursor + 46, cursor + 46 + nameLength);
    const localNameLength = buffer.readUInt16LE(offset + 26);
    const body = buffer.subarray(offset + 30 + localNameLength, offset + 30 + localNameLength + size);
    files[name] = (method === 8 ? inflateRawSync(body) : body).toString('utf8');
    cursor += 46 + nameLength;
  }
  return files;
}

// Numbers: fixed decimal mark, no thousands separators, trailing zeros trimmed past the minimum.
expectEqual(formatNumber(1234.5, 'money', ','), '1234,50', 'money keeps two decimals');
expectEqual(formatNumber(1.1, 'qty', '.'), '1.1', 'qty trims zeros');
expectEqual(formatNumber(2, 'qty', ','), '2', 'whole qty has no decimal mark');
expectEqual(formatNumber(0.12345, 'price', '.'), '0.1235', 'price rounds to four decimals');
expectEqual(formatNumber(3, 'price', '.'), '3.00', 'price keeps at least two');
expectEqual(formatNumber(-0.001, 'money', '.'), '0.00', 'no negative zero');
expectEqual(formatNumber(66.666, 'percent', ','), '66,7', 'percent has one decimal');
expectEqual(cellText('2026-09-28', 'date', { decimalSeparator: ',', dateFormat: 'DD.MM.YYYY' }), '28.09.2026', 'bg date');
expectEqual(cellText('2026-09-28', 'date', { decimalSeparator: ',', dateFormat: 'MM/DD/YYYY' }), '09/28/2026', 'us date');
expectEqual(cellText(null, 'money', { decimalSeparator: ',', dateFormat: 'DD.MM.YYYY' }), '', 'empty cell');

// Windows-1251: Cyrillic, the euro sign and № map to single bytes; anything else becomes "?".
expectEqual([...encodeWindows1251('Аяa€№Ёё✓')], [0xc0, 0xff, 0x61, 0x88, 0xb9, 0xa8, 0xb8, 0x3f], 'cp1251 bytes');

const columns = [
  { header: 'Стока', type: 'text' as const },
  { header: 'Дата', type: 'date' as const },
  { header: 'Сума', type: 'money' as const },
];
const rows = [
  ['Мляко "Верея"; 1 л', '2026-09-28', 12.5],
  ['=HYPERLINK("x")', null, -3],
];
const bg = buildCsv(columns, rows, {
  delimiter: ';',
  decimalSeparator: ',',
  dateFormat: 'DD.MM.YYYY',
  encoding: 'UTF8',
  includeHeader: true,
});
expectEqual(
  bg.toString('utf8'),
  'Стока;Дата;Сума\r\n"Мляко ""Верея""; 1 л";28.09.2026;12,50\r\n"\'=HYPERLINK(""x"")";;-3,00\r\n',
  'csv quoting, formula guard and Bulgarian formats',
);
const plain = buildCsv(columns, rows.slice(0, 1), DEFAULT_CSV_FORMAT);
expectEqual([...plain.subarray(0, 3)], [0xef, 0xbb, 0xbf], 'default csv has a BOM');
expectEqual(plain.subarray(3).toString('utf8').split('\r\n')[1], '"Мляко ""Верея""; 1 л",2026-09-28,12.50', 'default csv row');
const noHeader = buildCsv(columns, rows.slice(0, 1), { ...DEFAULT_CSV_FORMAT, includeHeader: false, encoding: 'WINDOWS_1251' });
expectEqual(noHeader[0], 0x22, 'no header and no BOM in cp1251');
expectEqual(noHeader.includes(0xcc), true, 'cp1251 М');

expectEqual(safeSheetName('Покупки / продажби: [ДДС] и още дълго заглавие'), 'Покупки   продажби   ДДС  и още', 'sheet name sanitised');

async function run() {
  const zip = readZip(await zipToBuffer([{ name: 'папка/файл.txt', data: Buffer.from('здравей'.repeat(50)) }]));
  expectEqual(zip['папка/файл.txt'], 'здравей'.repeat(50), 'zip round trip with UTF-8 name');

  const workbook = await buildXlsx({
    sheetName: 'Оборот',
    heading: ['Оборот и печалба', 'Обект: Main Store'],
    columns,
    rows,
    totals: ['Общо', null, 9.5],
    notes: ['Бележка & <тест>'],
    dateFormat: 'dd.mm.yyyy',
  });
  const parts = readZip(workbook);
  expectEqual(Object.keys(parts).sort(), [
    '[Content_Types].xml',
    '_rels/.rels',
    'xl/_rels/workbook.xml.rels',
    'xl/styles.xml',
    'xl/workbook.xml',
    'xl/worksheets/sheet1.xml',
  ], 'xlsx parts');
  const sheet = parts['xl/worksheets/sheet1.xml'];
  expectEqual(sheet.includes('<c r="B5" s="2"><v>46293</v></c>'), true, 'date stored as an Excel serial');
  expectEqual(sheet.includes('<c r="C6" s="10"><v>-3</v></c>'), true, 'money stored as a number');
  expectEqual(sheet.includes('Бележка &amp; &lt;тест&gt;'), true, 'text escaped');
  expectEqual(sheet.includes('ySplit="4"'), true, 'header row frozen');

  if (process.env.EXPORT_SAMPLES) {
    const { writeFileSync } = await import('fs');
    writeFileSync(`${process.env.EXPORT_SAMPLES}/sample.xlsx`, workbook);
    writeFileSync(`${process.env.EXPORT_SAMPLES}/sample.csv`, bg);
  }
  console.log('export writers: ok');
}

module.exports = run();
