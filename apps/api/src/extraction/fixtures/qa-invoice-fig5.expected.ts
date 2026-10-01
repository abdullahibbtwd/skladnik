/**
 * Expected extraction for qa_invoice.jpg (Fig. 5 / SKL-06 regression).
 * Used by live prove-scan scripts and offline post-process / schema tests.
 */
export const QA_INVOICE_FIG5_EXPECTED = {
  documentNumber: '0000459999',
  issuedOn: '2026-09-30',
  supplierTaxId: '204567890',
  taxableBase: 19.0,
  vatAmount: 3.8,
  grossTotal: 22.8,
  lines: [
    // Line shapes from the audit — batch/expiry must survive on line 2.
    { index: 1, batch: null as string | null, expiry: null as string | null, barcode: null as string | null },
    { index: 2, batch: 'QA-KM-01', expiry: '2026-10-15', barcode: '3801000000024' },
    { index: 3, batch: null as string | null, expiry: null as string | null, barcode: '3801000000024' },
  ],
  lineCount: 3,
} as const;
