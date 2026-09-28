import { cleanDocumentNumber, parseOcrDate } from './parse-ocr-date';

function iso(date: Date | null) {
  return date ? date.toISOString().slice(0, 10) : null;
}

if (iso(parseOcrDate('15.09.2026г.')) !== '2026-09-15') {
  throw new Error(`bg date ${iso(parseOcrDate('15.09.2026г.'))}`);
}
if (iso(parseOcrDate('15/09/2026')) !== '2026-09-15') {
  throw new Error('slash date');
}
if (iso(parseOcrDate('2026-09-15')) !== '2026-09-15') {
  throw new Error('iso date');
}
if (parseOcrDate('not a date') !== null) {
  throw new Error('garbage should be null');
}
if (iso(parseOcrDate('№0000310425 / 15.09.2026г.')) !== '2026-09-15') {
  throw new Error('date inside document number line');
}

for (const number of ['0000123', '0000310425', '№0000310425', '2026']) {
  if (parseOcrDate(number) !== null) {
    throw new Error(`invoice number ${number} read as date ${iso(parseOcrDate(number))}`);
  }
}
if (parseOcrDate('0122-12-31') !== null || parseOcrDate('31.12.0122') !== null) {
  throw new Error('implausible year should be null');
}
if (iso(parseOcrDate('15 Sep 2026')) !== '2026-09-15') {
  throw new Error(`month name ${iso(parseOcrDate('15 Sep 2026'))}`);
}

if (cleanDocumentNumber('№0000310425 / 15.09.2026г.') !== '0000310425') {
  throw new Error(`number ${cleanDocumentNumber('№0000310425 / 15.09.2026г.')}`);
}
if (cleanDocumentNumber('FV/2026/09/1402') !== 'FV/2026/09/1402') {
  throw new Error('keep real slash numbers');
}

console.log('parse-ocr-date tests passed');
