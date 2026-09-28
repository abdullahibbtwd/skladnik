import { NameIndex, nameKey, partnerKey } from './name-matching';

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

console.log('name-matching tests passed');
