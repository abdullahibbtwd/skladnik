import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  headerFromLayoutMarkdown,
  linesFromLayoutMarkdown,
  parseEuropeanNumber,
} from './parse-layout-markdown';

const STOCK = `
Стокова разписка
Доставчик ХУБЕВ ЕООД
Иденти.Ne 106591191
<table class="table"><thead><tr><th>No</th><th>№</th><th>Стока</th><th>Годно до</th><th>Партида</th><th>Мярка</th><th>Кол.</th><th>Цена</th><th>Пр цена</th><th>%то</th><th>Стойност</th></tr></thead><tbody>
<tr><td>1</td><td>200005</td><td>Яйца</td><td>27.09.2026</td><td>000846</td><td>кутия</td><td>36</td><td>1,22</td><td>1,22</td><td>5</td><td>43,92</td></tr>
<tr><td>2</td><td>4876</td><td>Луканка</td><td>21.01.2027</td><td>677901</td><td>бр.</td><td>√ 5</td><td>3,16</td><td>2,9165</td><td>5</td><td>14,58</td></tr>
</tbody></table>
`;

/** GLM-OCR often splits a commercial invoice into header-less fragments. */
const COMMERCIAL_FRAGMENTS = `
## Търговски документ
Ne0000310425 / 15.09.2026г.
<table><tr><td>Описание на стоката</td><td>Вид</td><td>Партида</td><td>Количество</td><td>Ед. цена</td><td>ТО%</td><td>Кр. цена</td><td>Стойност</td></tr></table>
<table><tr><td>58013-БОЖУРКА ГОВЕЖДО МЕСО 0.520</td><td></td><td>28082026</td><td>6.000бр</td><td>10.000</td><td>0</td><td>10.000</td><td>60.00</td></tr>
<tr><td>58180-БОЖУРКА КИСЕЛИ КРАСТАВИЧКИ 0.680</td><td>пак</td><td>080926</td><td>6.000бр</td><td>1.324</td><td>0</td><td>1.324</td><td>7.94</td></tr></table>
<table><tr><td>14876-ЕКОМЕС ДОМАШЕН СУДЖУК</td><td>110826</td><td>1.938кг</td><td>12,990</td><td>-5</td><td>12,340</td><td>23.92</td></tr></table>
`;

const CONTINUATION_NO_HEADER = `
<table><tr><td>19</td><td>157</td><td>САН БЕНЕДЕТТО - Студен чай 1.500 л</td><td>12.03.2027</td><td>L110526</td><td>стек</td><td>√2</td><td>7.99</td><td>7.5905</td><td>5</td><td>15.18</td></tr>
<tr><td>20</td><td>10421</td><td>ФИЛАДЕЛФИЯ Крема сирене 175гр</td><td>11.12.2026</td><td>OF733342</td><td>бр.</td><td>6</td><td>2.96</td><td>2.812</td><td>5</td><td>16.87</td></tr></table>
`;

describe('parse-layout-markdown', () => {
  it('parses European decimals and checkmark quantities', () => {
    assert.equal(parseEuropeanNumber('1,22'), 1.22);
    assert.equal(parseEuropeanNumber('√ 5'), 5);
    assert.equal(parseEuropeanNumber('2,035'), 2.035);
    assert.equal(parseEuropeanNumber('6.000бр'), 6);
    assert.equal(parseEuropeanNumber('1.938кг'), 1.938);
  });

  it('extracts line rows from HTML table', () => {
    const lines = linesFromLayoutMarkdown(STOCK);
    assert.equal(lines.length, 2);
    assert.equal(lines[0].supplierCode, '200005');
    assert.equal(lines[0].ocrDescription, 'Яйца');
    assert.equal(lines[0].qty, 36);
    assert.equal(lines[0].unitPrice, 1.22);
    assert.equal(lines[0].lineTotal, 43.92);
    assert.equal(lines[0].ocrExpiryDate, '2026-09-27');
    assert.equal(lines[0].ocrBatchNumber, '000846');
    assert.equal(lines[1].qty, 5);
    assert.equal(lines[1].finalUnitPrice, 2.9165);
  });

  it('merges fragmented commercial invoice tables', () => {
    const lines = linesFromLayoutMarkdown(COMMERCIAL_FRAGMENTS);
    assert.ok(lines.length >= 3, `expected >=3 lines, got ${lines.length}`);
    assert.equal(lines[0].supplierCode, '58013');
    assert.match(lines[0].ocrDescription, /БОЖУРКА/);
    assert.equal(lines[0].qty, 6);
    assert.equal(lines[0].lineTotal, 60);
    assert.equal(lines[2].qty, 1.938);
  });

  it('parses header-less continuation pages', () => {
    const lines = linesFromLayoutMarkdown(CONTINUATION_NO_HEADER);
    assert.equal(lines.length, 2);
    assert.equal(lines[0].printedLineNumber, 19);
    assert.equal(lines[0].supplierCode, '157');
    assert.equal(lines[0].qty, 2);
    assert.equal(lines[0].ocrExpiryDate, '2027-03-12');
    assert.equal(lines[1].qty, 6);
  });

  it('reads supplier from OCR text', () => {
    const header = headerFromLayoutMarkdown(STOCK);
    assert.match(header.supplier?.name ?? '', /ХУБЕВ/);
    assert.equal(header.supplier?.taxId, '106591191');
    assert.equal(header.documentType, 'RECEIPT');
  });
});
