import { barcodeForMatching, gtinCheckDigit, isValidGtin, validateBarcode } from './barcode';

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

// Known valid EAN-13 (Wikipedia example / common test): 4006381333931
assert(isValidGtin('4006381333931'), 'valid EAN-13');
assert(gtinCheckDigit('400638133393') === 1, 'check digit');

// Audit SKL-06: extra digit on a 13-digit code → length 14 may pass length but fail checksum, or stay invalid
const bad = validateBarcode('38010000000024'); // 14 digits from audit
assert(!bad.valid, `extra-digit barcode must be invalid ${JSON.stringify(bad)}`);
assert(barcodeForMatching('38010000000024') === null, 'invalid barcode not used for matching');

const good13 = '3801000000024'; // 13 digits — may or may not have valid checksum; test structure
const check = validateBarcode(good13);
assert(check.digits === '3801000000024', 'digits preserved');
assert(validateBarcode(' 3801000000024 ').digits === '3801000000024', 'trim only, never drop digits');

assert(validateBarcode('123').reason === 'LENGTH', 'short');
assert(validateBarcode('').reason === 'EMPTY', 'empty');
assert(barcodeForMatching(null) === null, 'null');

console.log('barcode unit checks passed.');
