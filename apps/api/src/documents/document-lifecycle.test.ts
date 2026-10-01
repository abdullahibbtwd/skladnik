/**
 * Unit checks for submit/post lifecycle classification and document-number normalisation (SKL-01/02/03/09/10).
 */
import { normalizeDocumentNumber, documentNumbersMatch } from '@skladnik/shared';
import {
  classifyDocumentLifecycle,
  dateEqualsExpiryIssues,
  numberEqualsBatchIssues,
} from './document-lifecycle';

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function line(overrides: Record<string, unknown> = {}) {
  return {
    id: 'line-1',
    position: 0,
    productId: 'p1',
    product: { name: 'Milk', batchTracking: true, status: 'ACTIVE' },
    quantity: 10,
    ocrBatchNumber: 'LOT-1',
    ocrExpiryDate: '2026-12-01',
    ...overrides,
  };
}

// SKL-09 normalisation
assert(normalizeDocumentNumber('QA-TEST-001') === 'qatest001', 'dash case');
assert(normalizeDocumentNumber(' qa-test-001 ') === 'qatest001', 'spaces + case');
assert(normalizeDocumentNumber('QA/TEST.001') === 'qatest001', 'slash and dot');
assert(normalizeDocumentNumber('00123') === '123', 'leading zeros');
assert(normalizeDocumentNumber('000') === '0', 'all zeros');
assert(documentNumbersMatch('QA-TEST-001', ' qa-test-001 '), 'match variants');
assert(!documentNumbersMatch('A-1', 'B-1'), 'different numbers');

// SKL-01 number = batch
const batchClash = numberEqualsBatchIssues('L110526', [
  { position: 0, ocrBatchNumber: 'L110526' },
  { position: 1, ocrBatchNumber: 'OTHER' },
]);
assert(batchClash.length === 1 && batchClash[0]!.code === 'DOCUMENT_NUMBER_EQUALS_BATCH', `batch clash ${JSON.stringify(batchClash)}`);
assert(numberEqualsBatchIssues('L110526', [{ position: 0, ocrBatchNumber: ' l110526 ' }]).length === 1, 'normalised batch clash');

// SKL-01 date = expiry
const dateClash = dateEqualsExpiryIssues('2027-03-12', [
  { position: 0, ocrBatchNumber: 'L1', ocrExpiryDate: '2027-03-12' },
]);
assert(dateClash.length === 1 && dateClash[0]!.code === 'DOCUMENT_DATE_EQUALS_EXPIRY', `date clash ${JSON.stringify(dateClash)}`);

const today = '2026-10-01';
const base = {
  type: 'INVOICE',
  number: 'INV-1',
  issuedOn: '2026-09-15',
  partnerId: 'partner-1',
  totals: null,
  lines: [line()],
};

// SKL-02 future date blocks submit and post
const future = classifyDocumentLifecycle({ ...base, issuedOn: '2027-03-12' }, today);
assert(future.blockBoth.some((i) => i.code === 'DOCUMENT_DATE_FUTURE'), `future blockBoth ${JSON.stringify(future.blockBoth)}`);
assert(!future.blockPost.some((i) => i.code === 'DOCUMENT_DATE_FUTURE'), 'future only in blockBoth');

// SKL-10 empty lines
const empty = classifyDocumentLifecycle({ ...base, lines: [] }, today);
assert(empty.blockBoth.some((i) => i.code === 'DOCUMENT_EMPTY_LINES'), `empty ${JSON.stringify(empty.blockBoth)}`);
assert(empty.blockBoth[0]!.message.includes('Добавете поне един ред'), 'Bulgarian empty message');

// SKL-03 pending product: warn on submit, block post
const pending = classifyDocumentLifecycle(
  {
    ...base,
    lines: [line({ product: { name: 'OCR guess', batchTracking: false, status: 'PENDING_REVIEW' } })],
  },
  today,
);
assert(pending.blockBoth.length === 0, `pending should not block submit ${JSON.stringify(pending.blockBoth)}`);
assert(pending.blockPost.some((i) => i.code === 'PENDING_PRODUCT'), `pending blockPost ${JSON.stringify(pending.blockPost)}`);

// SKL-01 number=batch → blockPost only
const numBatch = classifyDocumentLifecycle(
  { ...base, number: 'LOT-1', lines: [line({ ocrBatchNumber: 'LOT-1' })] },
  today,
);
assert(numBatch.blockBoth.length === 0, 'number=batch must not block Staff submit');
assert(numBatch.blockPost.some((i) => i.code === 'DOCUMENT_NUMBER_EQUALS_BATCH'), 'number=batch blocks post');

// date=expiry → needsConfirm
const dateEq = classifyDocumentLifecycle(
  { ...base, issuedOn: '2026-12-01', lines: [line({ ocrExpiryDate: '2026-12-01' })] },
  today,
);
assert(dateEq.needsConfirm.some((i) => i.code === 'DOCUMENT_DATE_EQUALS_EXPIRY'), `date=expiry confirm ${JSON.stringify(dateEq.needsConfirm)}`);

// old date → needsConfirm
const old = classifyDocumentLifecycle({ ...base, issuedOn: '2026-01-01' }, today);
assert(old.needsConfirm.some((i) => i.code === 'DOCUMENT_DATE_OLD'), `old date ${JSON.stringify(old.needsConfirm)}`);

// ACC-04 / ACC-14: totals MISSING blocks post for invoices
const missingTotals = classifyDocumentLifecycle(
  {
    ...base,
    totals: {
      status: 'MISSING',
      required: true,
      tolerance: 0.02,
      calculated: { taxableBase: 60.31, vat: 12.06, total: 72.37, byRate: [] },
      printed: { taxableBase: null, vat: null, total: null },
      difference: { taxableBase: null, vat: null, total: null },
      mismatched: [],
    },
  },
  today,
);
assert(missingTotals.blockPost.some((i) => i.code === 'TOTALS_MISSING'), 'TOTALS_MISSING blocks post');

// ACC-04: first printed line > 1
const missingPage = classifyDocumentLifecycle({ ...base, scanFirstLineNumber: 19 }, today);
assert(missingPage.blockPost.some((i) => i.code === 'MISSING_PREVIOUS_PAGE'), 'MISSING_PREVIOUS_PAGE');

// ACC-04: amount in words mismatch (parsed)
const words = classifyDocumentLifecycle(
  {
    ...base,
    amountInWordsParsed: 348.42,
    totals: {
      status: 'MATCH',
      required: true,
      tolerance: 0.02,
      calculated: { taxableBase: 50, vat: 10, total: 60.31, byRate: [] },
      printed: { taxableBase: 50, vat: 10, total: 60.31 },
      difference: { taxableBase: 0, vat: 0, total: 0 },
      mismatched: [],
    },
  },
  today,
);
assert(words.blockPost.some((i) => i.code === 'AMOUNT_IN_WORDS_MISMATCH'), 'AMOUNT_IN_WORDS_MISMATCH');

// ACC-14: zero price blocks RECEIPT/INVOICE unless freeOfCharge
const zeroPrice = classifyDocumentLifecycle(
  { ...base, type: 'RECEIPT', lines: [line({ unitPrice: 0, freeOfCharge: false })] },
  today,
);
assert(zeroPrice.blockPost.some((i) => i.code === 'ZERO_PRICE_LINE'), 'ZERO_PRICE_LINE');
const free = classifyDocumentLifecycle(
  { ...base, type: 'RECEIPT', lines: [line({ unitPrice: 0, freeOfCharge: true })] },
  today,
);
assert(!free.blockPost.some((i) => i.code === 'ZERO_PRICE_LINE'), 'freeOfCharge allows zero');

console.log('document-lifecycle unit checks passed.');
