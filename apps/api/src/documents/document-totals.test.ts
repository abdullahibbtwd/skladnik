import {
  DOCUMENT_DATE_MAX_AGE_DAYS,
  TOTALS_TOLERANCE_EUR,
  documentDateIssue,
  documentTotals,
  reconcileTotals,
  requiresPartner,
  totalsTolerance,
} from '@skladnik/shared';
import { parseExtractedDocument } from '../extraction/extracted-document.schema';
import { linePricing } from '../extraction/match-extracted';
import { dateWarning, headerErrors } from './can-document-be-posted';
import { computeLineAmounts } from './document-pricing';

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

// Same rounding as the VAT ledger: base per rate, VAT per rate.
const mixed = documentTotals([
  { net: 100, rate: 20 },
  { net: 30.004, rate: 9 },
  { net: 20.004, rate: 9 },
  { net: 10, rate: 0 },
]);
assert(mixed.taxableBase === 160.01 && mixed.vat === 24.5 && mixed.total === 184.51, `mixed totals ${JSON.stringify(mixed)}`);
assert(
  mixed.byRate.length === 3 &&
    mixed.byRate[0]!.rate === 0 &&
    mixed.byRate[1]!.rate === 9 &&
    mixed.byRate[1]!.taxableBase === 50.01 &&
    mixed.byRate[1]!.vat === 4.5 &&
    mixed.byRate[2]!.rate === 20,
  `byRate ${JSON.stringify(mixed.byRate)}`,
);

// The QA audit's printed example: base 75,20, VAT 15,04, total 90,24.
const audit = documentTotals([{ net: 75.2, rate: 20 }]);
assert(audit.vat === 15.04 && audit.total === 90.24, `audit example ${JSON.stringify(audit)}`);

assert(TOTALS_TOLERANCE_EUR === 0.02, `named tolerance ${TOTALS_TOLERANCE_EUR}`);
assert(totalsTolerance(3) === 0.02, `tolerance is a fixed 0.02, not scaled by lines`);

// L110526: 2 × 7,99 + 6 × 2,96 + 4 × 4,13 = 50,26 net, while 14,13 was on the document.
const l110526Lines = [
  { qty: 2, price: 7.99 },
  { qty: 6, price: 2.96 },
  { qty: 4, price: 4.13 },
].map((line) => ({ net: computeLineAmounts(line.qty, line.price).lineTotal, rate: 20 }));
const l110526 = documentTotals(l110526Lines);
assert(l110526.taxableBase === 50.26, `L110526 base ${l110526.taxableBase}`);
const wrong = reconcileTotals({ type: 'INVOICE', calculated: l110526, printed: { taxableBase: 14.13, vat: null, total: null }, lineCount: 3 });
assert(wrong.status === 'MISMATCH' && wrong.mismatched[0] === 'taxableBase', `L110526 should mismatch ${JSON.stringify(wrong)}`);
const wrongErrors = headerErrors({ type: 'INVOICE', issuedOn: '2026-09-29', partnerId: 'p1', totals: wrong }, '2026-09-30');
assert(wrongErrors.some((error) => error.includes("doesn't match")), `mismatch must block ${JSON.stringify(wrongErrors)}`);
assert(wrongErrors.some((error) => error.includes('grand total')), 'an invoice without a printed grand total must block');

const rounding = reconcileTotals({
  type: 'INVOICE',
  calculated: l110526,
  printed: { taxableBase: 50.27, vat: 10.05, total: 60.32 },
  lineCount: 3,
});
assert(rounding.status === 'MATCH', `within ${TOTALS_TOLERANCE_EUR} is fine ${JSON.stringify(rounding)}`);
assert(headerErrors({ type: 'INVOICE', issuedOn: '2026-09-29', partnerId: 'p1', totals: rounding }, '2026-09-30').length === 0, 'matching invoice posts');

const overTolerance = reconcileTotals({
  type: 'INVOICE',
  calculated: l110526,
  printed: { taxableBase: 50.3, vat: null, total: 60.36 },
  lineCount: 3,
});
assert(overTolerance.status === 'MISMATCH', `0.04 over ${TOTALS_TOLERANCE_EUR} must mismatch`);

const creditNote = reconcileTotals({ type: 'CREDIT_NOTE', calculated: audit, printed: { taxableBase: -75.2, vat: -15.04, total: -90.24 }, lineCount: 1 });
assert(creditNote.status === 'MATCH', 'credit notes printed with a minus sign still match');

const receipt = reconcileTotals({ type: 'RECEIPT', calculated: audit, printed: { taxableBase: null, vat: null, total: null }, lineCount: 1 });
assert(receipt.status === 'MISSING' && !receipt.required, 'goods receipts may be posted without printed totals');
assert(headerErrors({ type: 'RECEIPT', issuedOn: '2026-09-29', totals: receipt }, '2026-09-30').length === 0, 'receipt without totals posts');

// MGR F-05: invoices and credit notes need a supplier; write-offs do not.
assert(requiresPartner('INVOICE') && requiresPartner('CREDIT_NOTE') && !requiresPartner('WRITE_OFF'), 'partner required only for tax docs');
assert(
  headerErrors({ type: 'INVOICE', issuedOn: '2026-09-29', partnerId: null, totals: rounding }, '2026-09-30').some((error) =>
    error.includes('supplier'),
  ),
  'invoice without supplier must block',
);
assert(
  headerErrors({ type: 'WRITE_OFF', issuedOn: '2026-09-29', partnerId: null, totals: null }, '2026-09-30').length === 0,
  'write-off without partner posts',
);

// F-10: the misread 12.03.2027 date. Old = more than DOCUMENT_DATE_MAX_AGE_DAYS (90).
assert(DOCUMENT_DATE_MAX_AGE_DAYS === 90, `max age ${DOCUMENT_DATE_MAX_AGE_DAYS}`);
assert(documentDateIssue('2027-03-12', '2026-09-29') === 'FUTURE', 'future date');
assert(documentDateIssue('2026-09-29', '2026-09-29') === null, 'today is fine');
assert(documentDateIssue('2026-07-01', '2026-09-29') === null, '90 days ago is fine');
assert(documentDateIssue('2026-06-30', '2026-09-29') === 'OLD', '91 days ago needs a look');
const future = headerErrors({ type: 'TRANSFER', issuedOn: '2027-03-12', totals: null }, '2026-09-29');
assert(future.length === 1 && future[0].includes('future'), `future date blocks every document ${JSON.stringify(future)}`);
assert(dateWarning({ type: 'INVOICE', issuedOn: '2026-01-10' }, '2026-09-29')?.includes('90 days'), 'old invoice date warns');
assert(dateWarning({ type: 'OPENING_BALANCE', issuedOn: '2026-01-10' }, '2026-09-29') === null, 'opening stock may be back-dated');

// F-02: the model's line totals are never stored; price and discount are.
assert(JSON.stringify(linePricing({ qty: 2, unitPrice: 7.99, discountPercent: null, finalUnitPrice: null, lineTotal: 7.6 })) === JSON.stringify({ unitPrice: 7.99, discountPercent: 0 }), 'printed line total ignored');
assert(linePricing({ qty: 2, unitPrice: 10, discountPercent: null, finalUnitPrice: 9, lineTotal: 18 }).discountPercent === 10, 'discount derived from the discounted price');
assert(linePricing({ qty: 2, unitPrice: null, discountPercent: 5, finalUnitPrice: 9, lineTotal: 18 }).discountPercent === 0, 'a discounted price is not discounted twice');
assert(linePricing({ qty: 4, unitPrice: null, discountPercent: null, finalUnitPrice: null, lineTotal: 10 }).unitPrice === 2.5, 'price from total as last resort');

// F-05: header totals and payment method from the model.
const read = parseExtractedDocument({ lines: [], taxableBase: '75,20', vatAmount: 15.04, grossTotal: 90.24, paymentMethod: 'По банков път' });
assert(read.ok && read.data.taxableBase === 75.2 && read.data.vatAmount === 15.04 && read.data.paymentMethod === 'BANK_TRANSFER', `header totals ${JSON.stringify(read)}`);
const cash = parseExtractedDocument({ lines: [], paymentMethod: 'В брой' });
assert(cash.ok && cash.data.paymentMethod === 'CASH' && cash.data.taxableBase === null, `cash ${JSON.stringify(cash)}`);
const card = parseExtractedDocument({ lines: [], paymentMethod: 'CARD' });
assert(card.ok && card.data.paymentMethod === 'CARD', 'enum passes through');
const none = parseExtractedDocument({ lines: [] });
assert(none.ok && none.data.paymentMethod === null && none.data.grossTotal === null, 'nothing printed');

console.log('Document totals, date and extraction checks passed.');
