import assert from 'node:assert/strict';
import { parseBulgarianEuroAmountInWords } from '@skladnik/shared';

assert.equal(parseBulgarianEuroAmountInWords('Словом: триста четиридесет и осем евро и 42 ц.'), 348.42);
assert.equal(parseBulgarianEuroAmountInWords('словом двадесет и две евро и осемдесет цента'), 22.8);
assert.equal(parseBulgarianEuroAmountInWords('триста четиридесет и осем евро'), 348);
assert.equal(parseBulgarianEuroAmountInWords('неразбираем текст'), null);
assert.equal(parseBulgarianEuroAmountInWords(null), null);
assert.equal(parseBulgarianEuroAmountInWords('Словом: xyz евро'), null);

console.log('amount-in-words-bg.test.ts: ok');
