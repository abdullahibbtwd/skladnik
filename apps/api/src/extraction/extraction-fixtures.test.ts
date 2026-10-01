/**
 * Offline regression for SKL-01 / SKL-06 post-processing (no live GLM call).
 */
import { parseExtractedDocument } from './extracted-document.schema';
import { postProcessExtraction } from './post-process-extraction';
import { validateBarcode } from './barcode';
import { QA_INVOICE_FIG5_EXPECTED } from './fixtures/qa-invoice-fig5.expected';

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

// Fig. 1 failure mode: batch/expiry landed in the header — cross-check must flag it.
const fig1Mixup = parseExtractedDocument({
  documentNumber: 'L110526',
  issuedOn: '2027-03-12',
  supplier: { name: 'ВРАЛЯ-ДЕРИТ ЕООД', taxId: null, address: null, mol: null, phone: null },
  client: { name: null, taxId: null, address: null },
  lines: [
    {
      ocrDescription: 'САН БЕНЕДЕТО',
      qty: 1,
      ocrBatchNumber: 'L110526',
      ocrExpiryDate: '2027-03-12',
    },
  ],
  confidence: 'high',
});
assert(fig1Mixup.ok, 'fig1 parse');
const fig1 = postProcessExtraction(fig1Mixup.data, '2026-10-01');
assert(
  fig1.warnings.some((w) => w.code === 'DOCUMENT_NUMBER_EQUALS_BATCH'),
  `expected number=batch warning ${JSON.stringify(fig1.warnings)}`,
);
assert(
  fig1.warnings.some((w) => w.code === 'DOCUMENT_DATE_EQUALS_EXPIRY' || w.code === 'DOCUMENT_DATE_FUTURE'),
  `expected date warning ${JSON.stringify(fig1.warnings)}`,
);
assert(fig1.document.fieldConfidence.documentNumber === 'low', 'documentNumber confidence low');
assert(fig1.document.fieldConfidence.issuedOn === 'low', 'issuedOn confidence low');

// Fig. 5: valid expected payload passes; invalid barcode is flagged and not "fixed".
const fig5 = parseExtractedDocument({
  documentNumber: QA_INVOICE_FIG5_EXPECTED.documentNumber,
  issuedOn: QA_INVOICE_FIG5_EXPECTED.issuedOn,
  supplier: { name: 'Балкан Дистрибуция ООД', taxId: QA_INVOICE_FIG5_EXPECTED.supplierTaxId, address: null, mol: null, phone: null },
  client: { name: null, taxId: null, address: null },
  taxableBase: QA_INVOICE_FIG5_EXPECTED.taxableBase,
  vatAmount: QA_INVOICE_FIG5_EXPECTED.vatAmount,
  grossTotal: QA_INVOICE_FIG5_EXPECTED.grossTotal,
  lines: [
    { ocrDescription: 'Line 1', qty: 1, ocrBatchNumber: null, ocrExpiryDate: null, barcode: null },
    {
      ocrDescription: 'Line 2',
      qty: 1,
      ocrBatchNumber: QA_INVOICE_FIG5_EXPECTED.lines[1].batch,
      ocrExpiryDate: QA_INVOICE_FIG5_EXPECTED.lines[1].expiry,
      barcode: '38010000000024', // extra digit as read by the buggy model
    },
    {
      ocrDescription: 'Line 3',
      qty: 1,
      ocrBatchNumber: null,
      ocrExpiryDate: null,
      barcode: '38010000000024',
    },
  ],
  confidence: 'high',
});
assert(fig5.ok, 'fig5 parse');
assert(fig5.data.lines[1]?.ocrBatchNumber === 'QA-KM-01', 'line 2 batch preserved in schema');
assert(fig5.data.lines[1]?.ocrExpiryDate === '2026-10-15', 'line 2 expiry preserved in schema');
const fig5pp = postProcessExtraction(fig5.data, '2026-10-01');
assert(fig5pp.warnings.filter((w) => w.code === 'BARCODE_INVALID').length >= 1, 'invalid barcode warned');
assert(!validateBarcode('38010000000024').valid, 'extra-digit barcode invalid');
assert(fig5pp.warnings.every((w) => w.code !== 'DOCUMENT_NUMBER_EQUALS_BATCH'), 'clean header should not clash');

console.log('extraction fixture regression checks passed.');
