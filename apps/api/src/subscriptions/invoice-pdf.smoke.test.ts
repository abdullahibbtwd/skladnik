/**
 * Smoke: pdfkit + bundled DejaVuSans renders Cyrillic and embeds the font.
 */
import assert from 'node:assert/strict';
import { existsSync } from 'fs';
import { invoicePdfFontPath, renderInvoicePdf } from './invoice-pdf';

const fontPath = invoicePdfFontPath();
assert.equal(existsSync(fontPath), true, `font missing at ${fontPath}`);

async function main() {
  const title = 'Проформа фактура';
  const pdf = await renderInvoicePdf({
    number: 'PI-2026-000001',
    title,
    currency: 'EUR',
    vatRate: 20,
    subtotalMinor: 10000,
    vatMinor: 2000,
    totalMinor: 12000,
    issuedAt: new Date('2026-10-06T12:00:00Z'),
    sellerName: 'Продавач ЕООД',
    sellerEik: '123456789',
    sellerAddress: 'София',
    sellerEmail: 'seller@example.com',
    buyerName: 'Купувач ООД',
    buyerEik: '987654321',
    buyerAddress: 'Пловдив',
    buyerEmail: 'buyer@example.com',
    lineItems: [
      {
        description: 'STARTER 12 месеца',
        quantity: 1,
        unitMinor: 10000,
        lineMinor: 10000,
      },
    ],
  });

  assert.ok(pdf.length > 500, `expected non-trivial PDF bytes, got ${pdf.length}`);
  assert.equal(pdf.subarray(0, 4).toString('ascii'), '%PDF');

  // pdfkit embeds TrueType as binary; presence of font file basename or TTF markers is enough.
  const asLatin = pdf.toString('latin1');
  assert.ok(
    asLatin.includes('DejaVuSans') || asLatin.includes('/FontFile2') || asLatin.includes('TrueType'),
    'PDF should embed a TrueType font (DejaVuSans)',
  );

  console.log(`invoice-pdf.smoke.test.ts: ok (${pdf.length} bytes)`);
}

module.exports = main();
