/**
 * ACC-06: every ЕИК in the demo / cafe seed must pass the official 9-digit check digit.
 * Fails the unit suite if a bad number is re-introduced.
 */
import assert from 'node:assert/strict';
import { isValidEik, taxIdProblems } from '@skladnik/shared';

/** Keep in sync with apps/api/src/seed/demo-seed.ts partner + company profiles. */
const SEED_EIKS: ReadonlyArray<{ label: string; eik: string }> = [
  { label: 'Demo Mini Market', eik: '206400170' },
  { label: 'Cafe tenant', eik: '207188457' },
  { label: 'Балкан Дистрибуция ООД', eik: '204512879' },
  { label: 'Млечен път ЕООД', eik: '203998410' },
  { label: 'Родопски деликатеси АД', eik: '175632901' },
  { label: 'Хлебозавод Изгрев ЕООД', eik: '131245785' },
  { label: 'Хотел Панорама ООД', eik: '205331472' },
  { label: 'Кафе Импорт ООД', eik: '206117343' },
];

for (const row of SEED_EIKS) {
  assert.equal(isValidEik(row.eik), true, `${row.label}: ЕИК ${row.eik} fails checksum`);
  assert.equal(
    taxIdProblems({ eik: row.eik, vatNumber: `BG${row.eik}` }).length,
    0,
    `${row.label}: VAT BG${row.eik} must match ЕИК`,
  );
}

// QA audit had these invalid values — keep them rejected so we never re-seed them.
assert.equal(isValidEik('204512873'), false);
assert.equal(isValidEik('203998412'), false);
assert.equal(isValidEik('175632904'), false);
// Real invoice ЕИК from the Staff audit photo — fails checksum; do not put on Балкан.
assert.equal(isValidEik('204567890'), false);

console.log('seed-eik.test.ts: ok');
