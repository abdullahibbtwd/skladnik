/**
 * ACC-06 / CAF-06: every demo company — profile, partners, groups and sites.
 * Fails if any ЕИК is invalid, the profile is empty, or an English seed name comes back.
 */
import assert from 'node:assert/strict';
import { isValidEik, taxIdProblems } from '@skladnik/shared';
import { demoMasterData } from './demo-seed';

const ENGLISH_SEED_NAMES = ['Coffee drinks', 'Ingredients', 'Pastry & drinks', 'Café Bar', 'Cafe Bar'];

for (const tenant of demoMasterData()) {
  const { profile } = tenant;
  assert.equal(isValidEik(profile.eik), true, `${tenant.company}: ЕИК ${profile.eik}`);
  assert.ok(profile.address.trim(), `${tenant.company}: address`);
  assert.ok(profile.city.trim(), `${tenant.company}: city`);
  assert.ok(profile.mol.trim(), `${tenant.company}: mol`);
  assert.ok(profile.declarant.trim(), `${tenant.company}: declarant`);
  assert.equal(taxIdProblems({ eik: profile.eik, vatNumber: tenant.vatNumber }).length, 0, `${tenant.company} VAT`);
  assert.ok(tenant.sites.length > 0, `${tenant.company}: site`);
  assert.ok(tenant.groups.length > 0, `${tenant.company}: groups`);
  for (const name of [...tenant.sites, ...tenant.groups]) {
    assert.equal(ENGLISH_SEED_NAMES.includes(name), false, `${tenant.company}: English seed name „${name}“`);
  }
  for (const partner of tenant.partners) {
    assert.equal(isValidEik(partner.eik), true, `${partner.name}: ЕИК ${partner.eik}`);
    assert.equal(taxIdProblems({ eik: partner.eik, vatNumber: `BG${partner.eik}` }).length, 0, partner.name);
  }
}

const cafe = demoMasterData().find((tenant) => tenant.company === 'Demo Café');
assert.ok(cafe, 'Demo Café');
assert.deepEqual(cafe!.groups, ['Съставки', 'Кафе напитки', 'Печива и напитки']);
assert.deepEqual(cafe!.sites, ['Кафе-бар']);
assert.deepEqual(cafe!.batchTracked, ['Прясно мляко 3.5%', 'Кроасан с масло']);

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
