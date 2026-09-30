import { Prisma } from '@prisma/client';
import {
  canOverridePrice,
  expiryLevel,
  expiryWindowsProblem,
  formatSeriesNumber,
  isBelowCost,
  normaliseEik,
  normaliseVatNumber,
  partnerTaxNumber,
  printTemplateOf,
  seriesForDocument,
  taxIdProblems,
} from '@skladnik/shared';
import { changes } from '../activity/record-activity';

function expectEqual(actual: unknown, expected: unknown, label: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${label}: expected ${e}, got ${a}`);
}

const codes = (ids: { eik?: string | null; vatNumber?: string | null }) => taxIdProblems(ids).map((problem) => problem.code);

// Tax IDs
expectEqual(normaliseVatNumber(' bg 204 512 879 '), 'BG204512879', 'VAT number normalised');
expectEqual(normaliseVatNumber('204512879'), 'BG204512879', 'bare digits read as a Bulgarian VAT number');
expectEqual(normaliseVatNumber('de123456789'), 'DE123456789', 'EU VAT number kept');
expectEqual(normaliseEik('BG204512879'), '204512879', 'ЕИК without the VAT prefix');
expectEqual(codes({ eik: '204512879', vatNumber: 'BG204512879' }), [], 'valid pair');
expectEqual(codes({ eik: '204512873' }), ['EIK_CHECKSUM'], 'audit example ЕИК fails the checksum');
expectEqual(codes({ vatNumber: 'BG204512873' }), ['VAT_CHECKSUM'], 'audit example VAT number fails the checksum');
expectEqual(codes({ eik: '20451287' }), ['EIK_FORMAT'], 'too short');
expectEqual(codes({ eik: '7501010010', vatNumber: 'BG7501010010' }), [], 'sole trader by ЕГН');
expectEqual(codes({ eik: '204512879', vatNumber: 'BG203998410' }), ['VAT_EIK_MISMATCH'], 'VAT number of another company');
expectEqual(codes({ eik: '1234567860123', vatNumber: 'BG123456786' }), [], 'branch ЕИК matches the head-office VAT number');
expectEqual(codes({ eik: '204512879', vatNumber: 'DE123456789' }), [], 'foreign VAT number is not compared with the ЕИК');
expectEqual(codes({ vatNumber: 'BG12' }), ['VAT_FORMAT'], 'malformed VAT number');
expectEqual(codes({}), [], 'no numbers, nothing to check');
expectEqual(partnerTaxNumber({ eik: '204512879', vatNumber: 'BG204512879' }), 'BG204512879', 'VAT number preferred');
expectEqual(partnerTaxNumber({ eik: '204512879', vatNumber: null }), '204512879', 'ЕИК when not VAT-registered');

// Numbering series
expectEqual(seriesForDocument('WRITE_OFF', 'OUT'), 'WRITE_OFF', 'write-offs have their own series');
expectEqual(seriesForDocument('TRANSFER', 'OUT'), 'TRANSFER', 'transfers');
expectEqual(seriesForDocument('PROTOCOL', 'OUT'), 'DISPATCH', 'outgoing protocol is issued by the company');
expectEqual(seriesForDocument('PROTOCOL', 'IN'), null, 'incoming protocol keeps the supplier number');
expectEqual(seriesForDocument('INVOICE', 'IN'), null, 'invoices keep the printed number');
expectEqual(formatSeriesNumber('ПБ-', 3, 4), 'ПБ-0003', 'padded');
expectEqual(formatSeriesNumber('ПБ-', 12345, 4), 'ПБ-12345', 'longer than the padding');

// Yearly reset helper (Sofia calendar year)
{
  const { seriesCalendarYear } = require('./document-series');
  expectEqual(typeof seriesCalendarYear(new Date('2026-12-31T22:30:00Z')), 'number', 'seriesCalendarYear returns a year');
  // 31 Dec 22:30 UTC = 1 Jan 00:30 Sofia (EET +2) → next calendar year
  expectEqual(seriesCalendarYear(new Date('2026-12-31T22:30:00Z')), 2027, 'Sofia year after UTC midnight');
  expectEqual(seriesCalendarYear(new Date('2026-12-31T20:00:00Z')), 2026, 'still 2026 in Sofia before midnight');
}

// Expiry thresholds
expectEqual(expiryWindowsProblem([30, 14, 7, 3]), null, 'defaults are valid');
expectEqual(expiryWindowsProblem([60, 21, 10, 0]), null, 'zero allowed for the last level');
expectEqual(expiryWindowsProblem([30, 14, 7]) !== null, true, 'needs four');
expectEqual(expiryWindowsProblem([30, 14, 14, 3]) !== null, true, 'strictly descending');
expectEqual(expiryWindowsProblem([400, 14, 7, 3]) !== null, true, 'at most a year');
expectEqual(expiryWindowsProblem([30, 14.5, 7, 3]) !== null, true, 'whole days');
expectEqual(
  [40, 30, 14, 8, 7, 4, 3, 0, -2].map((days) => expiryLevel(days)),
  ['safe', 'watch', 'warning', 'warning', 'urgent', 'urgent', 'critical', 'critical', 'expired'],
  'default levels',
);
expectEqual(expiryLevel(20, [60, 21, 10, 2]), 'warning', 'custom thresholds');

// Print template
expectEqual(printTemplateOf(null).signatures, ['Съставил', 'Приел'], 'default signatures');
expectEqual(printTemplateOf({ showPrices: false, signatures: ['a', 1, 'b', 'c', 'd', 'e'] }).signatures, ['a', 'b', 'c', 'd'], 'signatures cleaned and capped');
expectEqual(printTemplateOf({ showPrices: false }).showPrices, false, 'stored flag kept');

// Till prices
expectEqual(canOverridePrice('OWNER', []), true, 'owner always may');
expectEqual(canOverridePrice('STAFF', ['OWNER', 'SITE_MANAGER']), false, 'staff not allowed by default');
expectEqual(canOverridePrice('STAFF', ['STAFF']), true, 'staff when allowed');
expectEqual(isBelowCost(0.01, 20, 0.55), true, 'audit example: 0.01 against a cost of 0.55');
expectEqual(isBelowCost(0.66, 20, 0.55), false, '0.66 incl. 20% VAT is exactly the cost');
expectEqual(isBelowCost(0.65, 20, 0.55), true, 'just under cost after VAT');
expectEqual(isBelowCost(0.01, 20, null), false, 'unknown cost: no warning');

// Activity diffs
expectEqual(
  changes({ sellingPrice: new Prisma.Decimal('1.20'), name: 'Мляко' }, { sellingPrice: new Prisma.Decimal('0.99'), name: 'Мляко' }),
  { before: { sellingPrice: 1.2 }, after: { sellingPrice: 0.99 } },
  'only the changed field, decimals as numbers',
);
expectEqual(changes({ tags: ['a', 'b'] }, { tags: ['a', 'b'] }), null, 'equal arrays are no change');
expectEqual(changes({ a: 1, b: 2 }, { a: 1, b: 3 }, ['a']), null, 'fields limit the comparison');
expectEqual(
  changes({ issuedOn: new Date('2026-09-01T00:00:00Z') }, { issuedOn: new Date('2026-09-02T00:00:00Z') }),
  { before: { issuedOn: '2026-09-01T00:00:00.000Z' }, after: { issuedOn: '2026-09-02T00:00:00.000Z' } },
  'dates as ISO strings',
);

console.log('settings: ok');
