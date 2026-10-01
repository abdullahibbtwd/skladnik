/**
 * SKL-19: the stored capture must equal the uploaded file bytes.
 * prepareVisionImage may compress for OCR only — never mutate what StorageService uploads.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { prepareVisionImage } from './prepare-vision-image';

(async () => {
  const fixture = join(__dirname, 'fixtures', 'skl-fig5-qa-invoice.jpg');
  const original = readFileSync(fixture);

  assert.equal(original.length, 209_926, `fixture size ${original.length}`);

  const prepared = await prepareVisionImage(original, 'image/jpeg', { maxEdge: 1600, quality: 75, maxBytes: 80_000 });
  assert.notEqual(prepared.buffer.length, original.length, 'OCR copy is separate/compressed');
  assert.equal(original.equals(readFileSync(fixture)), true, 'original fixture unchanged after prepareVisionImage');
  assert.ok(prepared.buffer.length < original.length || (prepared.width ?? 0) <= 1600, 'OCR image is downscaled or smaller');

  console.log('original-image storage unit checks passed.');
})();
