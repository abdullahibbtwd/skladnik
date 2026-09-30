import { splitProductText } from './product-text';

function expectEqual(actual: unknown, expected: unknown, label: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

// Audit F-03: the name cell carried batch and expiry, and the product was created under that name.
expectEqual(
  splitProductText('Масло 82% 125 г, партида MS-1010, годно до 20.11.2026'),
  { name: 'Масло 82% 125 г', batch: 'MS-1010', expiry: '20.11.2026', code: null, barcode: null },
  'batch and expiry after the name',
);
expectEqual(
  splitProductText('Кисело мляко 3.6% 400 г П-да 2609 Годен до: 05.10.26г.'),
  { name: 'Кисело мляко 3.6% 400 г', batch: '2609', expiry: '05.10.26', code: null, barcode: null },
  'short forms',
);
expectEqual(
  splitProductText('Сирене краве 400 г (Lot: A12/3, exp. 2026-12-01)'),
  { name: 'Сирене краве 400 г', batch: 'A12/3', expiry: '2026-12-01', code: null, barcode: null },
  'latin forms in brackets',
);

expectEqual(splitProductText('12001-Прясно мляко 3% 1 л', '12001').code, '12001', 'known supplier code in front');
expectEqual(splitProductText('12001-Прясно мляко 3% 1 л', '12001').name, 'Прясно мляко 3% 1 л', 'name after the code');
expectEqual(splitProductText('M-005 - Масло 82% 125 г').code, 'M-005', 'generic leading code');
expectEqual(
  splitProductText('Прясно мляко 3% 1 л 3801000000014'),
  { name: 'Прясно мляко 3% 1 л', batch: null, expiry: null, code: null, barcode: '3801000000014' },
  'barcode in the name',
);

// Numbers that belong to the product stay.
expectEqual(splitProductText('Бира Загорка 0.5 л 6 бр').name, 'Бира Загорка 0.5 л 6 бр', 'plain name untouched');
expectEqual(splitProductText('Лотос салата 200 г').batch, null, '"лот" inside a word is not a batch');
expectEqual(splitProductText('Хляб 500 г').code, null, 'weight is not a leading code');
expectEqual(splitProductText('партида 123').name, 'партида 123', 'nothing left: keep the raw text');

console.log('product-text tests passed');
