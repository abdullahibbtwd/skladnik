import { NameIndex, nameKey, partnerKey, productKey } from './name-matching';

function expectEqual(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

expectEqual(nameKey('Кисело мляко 3,6%  400ГР'), 'kiselo mlyako 3.6 400 gr', 'cyrillic key');
expectEqual(nameKey('KISELO MLYAKO 3.6% 400 gr'), 'kiselo mlyako 3.6 400 gr', 'latin key');
// Latin "OMK" and Cyrillic "ОМК" are what OCR mixes up.
expectEqual(nameKey('OMK - Верс'), nameKey('ОМК - Верс'), 'mixed script');
expectEqual(nameKey('Щастие Юнак'), 'shtastie yunak', 'digraphs');
expectEqual(partnerKey('ЕТ "Иван Петров"'), partnerKey('Ivan Petrov ET'), 'legal form stripped');
expectEqual(partnerKey('Вратилата ЕООД'), 'vratilata', 'eood stripped');

type Row = { id: string; name: string };
const products = new NameIndex<Row>([
  { id: 'yogurt-400', name: 'Кисело мляко Вратилата 3,6% 400 гр' },
  { id: 'yogurt-500', name: 'Кисело мляко Вратилата 3,6% 500 гр' },
  { id: 'bread', name: 'Хляб Добруджа 650г' },
]);

expectEqual(products.find('КИСЕЛО МЛЯКО ВРАТИЛАТА 3.6% 400ГР')?.id, 'yogurt-400', 'exact after normalising');
expectEqual(products.find('Кисело мяко Вратилата 3,6% 400 гр')?.id, 'yogurt-400', 'one-letter OCR typo');
expectEqual(products.find('Кисело мляко Вратилата 3,6% 450 гр'), null, 'different weight never matches');
expectEqual(products.find('Сирене краве 400 гр'), null, 'unrelated name');

const ambiguous = new NameIndex<Row>([
  { id: 'a', name: 'Бира Загорка 0.5 кен' },
  { id: 'b', name: 'Бира Загорка 0.5 кан' },
]);
expectEqual(ambiguous.find('Бира Загорка 0.5 кын'), null, 'tie is ambiguous');

products.add({ id: 'new', name: 'Айрян 500 мл' });
expectEqual(products.find('айрян 500мл')?.id, 'new', 'records added during an import are found');

// Audit F-03 catalog: the clean invoice's three lines must land on the existing products.
expectEqual(productKey('Кисело мляко 400гр'), productKey('Кисело мляко 400 г'), 'unit spellings fold');
expectEqual(productKey('Прясно мляко 1лт'), productKey('Прясно мляко 1 л'), 'litre spellings fold');
const catalog = new NameIndex<Row>(
  [
    { id: 'M-001', name: 'Прясно мляко 3% 1 л' },
    { id: 'M-002', name: 'Кисело мляко 3.6% 400 г' },
    { id: 'M-005', name: 'Масло 82% 125 г' },
    { id: 'M-003', name: 'Кисело мляко 2% 400 г' },
  ],
  productKey,
  0.88,
  true,
);
expectEqual(catalog.find('Прящо мляко 3% 1 л')?.id, 'M-001', 'the misread "Прящо" still matches');
expectEqual(catalog.find('Кисело мляко 3,6% 400гр')?.id, 'M-002', 'comma decimal and "гр"');
expectEqual(catalog.find('Масло 82% 125 г')?.id, 'M-005', 'exact once batch/expiry are stripped');
expectEqual(catalog.find('Кисело мляко краве 3.6% 400 г')?.id, 'M-002', 'one extra word');
expectEqual(catalog.find('Масло краве 82% 125 г'), null, 'a one-word record never takes an extra word');
expectEqual(catalog.find('Кисело мляко 3.6% 500 г'), null, 'other size stays unmatched');

const suggestions = catalog.suggest('Кисело мляко 3.6 400', 3).map((row) => row.item.id);
expectEqual(suggestions[0], 'M-002', 'best suggestion first');
expectEqual(suggestions.includes('M-003'), true, 'a close sibling is offered too');
expectEqual(catalog.suggest('Шоколад 100 г').length, 0, 'nothing close, nothing offered');

const partners = new NameIndex<Row>([{ id: 'p', name: 'Млечен път ЕООД' }], partnerKey);
expectEqual(partners.find('Млечен път Юг ЕООД'), null, 'extra word is off for partners');

console.log('name-matching tests passed');
