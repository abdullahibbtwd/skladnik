import { parseExtractedDocument } from './extracted-document.schema';
import { counterpartyFromExtracted, resolveUnit, unitPriceFromLine } from './match-extracted';

const sample = {
  documentNumber: 'FV/2026/09/1402',
  issuedOn: '2026-09-14',
  documentType: 'INVOICE',
  supplier: { name: 'Metro', taxId: 'BG123', address: 'Sofia', mol: 'Ivan', phone: '02' },
  client: { name: 'Cafe', taxId: 'BG999', address: 'Plovdiv' },
  deliveryAddress: null,
  lines: [
    {
      supplierCode: '590123',
      ocrDescription: 'Milk',
      ocrUnit: 'бр.',
      qty: '4,5',
      unitPrice: '1.25',
      discountPercent: 10,
      finalUnitPrice: null,
      lineTotal: null,
      vatRate: 20,
      ocrBatchNumber: 'LOT-1',
      ocrExpiryDate: '2026-12-01',
    },
  ],
  grossTotal: 10,
  confidence: 'high',
};

const parsed = parseExtractedDocument(sample);
if (!parsed.ok) throw new Error(parsed.error);
if (parsed.data.lines[0].qty !== 4.5) throw new Error(`qty coerce ${parsed.data.lines[0].qty}`);
if (parsed.data.supplier.name !== 'Metro') throw new Error('supplier');

const fenced = parseExtractedDocument('```json\n{"documentNumber":"1","issuedOn":null,"documentType":null,"supplier":{},"client":{},"deliveryAddress":null,"lines":[],"grossTotal":null,"confidence":"low"}\n```');
if (!fenced.ok) throw new Error(fenced.error);

const thinking = parseExtractedDocument(
  'Let me inspect {the page}. Final answer:\n```json\n{"documentNumber":"0000310425","issuedOn":"2026-09-15","documentType":"INVOICE","supplier":{"name":"Metro"},"client":{},"lines":[],"confidence":"high"}\n```',
);
if (!thinking.ok || thinking.data.documentNumber !== '0000310425') {
  throw new Error(`thinking json ${thinking.ok ? thinking.data.documentNumber : thinking.error}`);
}

const bad = parseExtractedDocument('not json');
if (bad.ok) throw new Error('expected parse failure');

if (resolveUnit('бр.', [{ raw: 'бр.', unit: 'PCS' }]) !== 'PCS') throw new Error('unit alias');
if (resolveUnit('стек', [{ raw: 'стек', unit: 'CASE' }]) !== 'CASE') throw new Error('case alias');
if (resolveUnit('banana', []) !== 'OTHER') throw new Error('unknown unit');

if (counterpartyFromExtracted('INVOICE', parsed.data).name !== 'Metro') throw new Error('invoice counterparty');
if (counterpartyFromExtracted('PROTOCOL', parsed.data).name !== 'Cafe') throw new Error('protocol counterparty');

if (unitPriceFromLine({ qty: 2, unitPrice: null, finalUnitPrice: null, lineTotal: 10 }) !== 5) {
  throw new Error('derived unit price');
}

console.log('extraction schema/match unit checks passed.');
