import { FieldOverflowError, fixedRecord, fixedWidthFile, formatAmount, recordWidth, type FixedField } from './fixed-width';
import { stableHash } from './hash';
import { isValidBgVatNumber, isValidEgn, isValidEik, isValidLnch, ledgerTaxId } from '@skladnik/shared';

function expectEqual(actual: unknown, expected: unknown, label: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${label}: expected ${e}, got ${a}`);
}

// Identification numbers
expectEqual(isValidEik('123456786'), true, 'ЕИК checksum');
expectEqual(isValidEik('123456787'), false, 'ЕИК wrong checksum');
expectEqual(isValidEik('1234567860123'), true, '13-digit ЕИК');
expectEqual(isValidEik('1234567860124'), false, '13-digit ЕИК wrong branch checksum');
expectEqual(isValidEgn('7501010010'), true, 'ЕГН checksum');
expectEqual(isValidEgn('7501010011'), false, 'ЕГН wrong checksum');
expectEqual(isValidLnch('1000000001'), true, 'ЛНЧ checksum');
expectEqual(isValidBgVatNumber('BG123456786'), true, 'BG VAT from ЕИК');
expectEqual(isValidBgVatNumber('BG7501010010'), true, 'BG VAT from ЕГН');
expectEqual(isValidBgVatNumber('BG123456787'), false, 'BG VAT bad checksum');
expectEqual(isValidBgVatNumber('123456786'), false, 'VAT number needs the prefix');
expectEqual(ledgerTaxId(' 123 456 786 ', true), { value: 'BG123456786', valid: true, assumedBg: true }, 'supplier that charged VAT gets BG prefix');
expectEqual(ledgerTaxId('123456786', false), { value: '123456786', valid: true, assumedBg: false }, 'no VAT charged: ЕИК kept');
expectEqual(ledgerTaxId('bg 123456786', true), { value: 'BG123456786', valid: true, assumedBg: false }, 'prefix normalised');
expectEqual(ledgerTaxId('DE123456789', true).valid, true, 'EU VAT number shape');
expectEqual(ledgerTaxId('XX1', true).valid, false, 'unknown country');
expectEqual(ledgerTaxId('999999999999999', false).valid, true, 'foreign person without number');
expectEqual(ledgerTaxId('', true), { value: null, valid: false, assumedBg: false }, 'empty');

// Fixed-width records
const fields: FixedField[] = [
  { code: 'a', width: 6, kind: 'text' },
  { code: 'b', width: 10, kind: 'amount' },
  { code: 'c', width: 4, kind: 'int' },
  { code: 'd', width: 4, kind: 'coefficient' },
];
expectEqual(recordWidth(fields), 24, 'record width');
expectEqual(fixedRecord(fields, { a: 'Склад', b: 1234.5, c: 7, d: 0.5 }), 'Склад    1234.50   70.50', 'padding and alignment');
expectEqual(fixedRecord(fields, { a: 'Много дълго име', b: -200, c: null, d: 1 }), 'Много    -200.00   01.00', 'text cut, negative amount');
expectEqual(fixedRecord(fields, { a: 'a\r\nb\tc' }), 'a b c       0.00   00.00', 'line breaks removed');
expectEqual(formatAmount(-0.001), '0.00', 'no negative zero');
expectEqual(formatAmount(1.005), '1.01', 'half up');
let overflow = false;
try {
  fixedRecord(fields, { b: 12345678.9 });
} catch (error) {
  overflow = error instanceof FieldOverflowError && error.code === 'b';
}
expectEqual(overflow, true, 'numbers that do not fit throw');

const file = fixedWidthFile(['ДДС', 'AB']);
expectEqual([...file], [0xc4, 0xc4, 0xd1, 0x0d, 0x0a, 0x41, 0x42, 0x0d, 0x0a], 'cp1251 bytes, CRLF after every record');
expectEqual(new TextDecoder('windows-1251').decode(file), 'ДДС\r\nAB\r\n', 'round trip');
expectEqual(fixedWidthFile([]).length, 0, 'no records, empty file');

// Stable hashing
expectEqual(stableHash({ b: 1, a: [2, { d: 1, c: 2 }] }) === stableHash({ a: [2, { c: 2, d: 1 }], b: 1 }), true, 'key order does not change the hash');
expectEqual(stableHash({ a: 1 }) === stableHash({ a: 2 }), false, 'values change the hash');

console.log('compliance ok');
