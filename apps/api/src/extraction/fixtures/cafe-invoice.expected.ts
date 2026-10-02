/**
 * Café invoice Кафе Импорт ООД № 0000007802 / 01.10.2026 (CAF-01).
 * `printedUnit` is what the model stored in the quantity cell; `modelQty` is the 1 it left behind.
 * Prices are the per-unit amounts that make the printed totals match once the quantities are read.
 */
export const CAFE_INVOICE_TOTALS = {
  documentNumber: '0000007802',
  issuedOn: '2026-10-01',
  supplierName: 'Кафе Импорт ООД',
  supplierTaxId: '204567890',
  taxableBase: 61,
  vatAmount: 12.2,
  grossTotal: 73.2,
  confidence: 'high',
} as const;

export const CAFE_INVOICE_LINES = [
  {
    name: 'Мляко прясно 3,5% 1 л',
    printedUnit: '12 л',
    modelQty: 1,
    productUnit: 'L' as const,
    unitPrice: 2.5,
    batch: 'ML-2710',
    expiry: '2026-10-10',
  },
  {
    name: 'Кафе на зърна Арабика 1 кг',
    printedUnit: '2 кг',
    modelQty: 1,
    productUnit: 'KG' as const,
    unitPrice: 12,
    batch: 'AR-0926',
    expiry: '2027-06-30',
  },
  {
    name: 'Сметана за разбиване 35% 1 л',
    printedUnit: '2 л',
    modelQty: 1,
    productUnit: 'L' as const,
    unitPrice: 3.5,
    batch: 'SM-1001',
    expiry: '2026-10-05',
  },
] as const;
