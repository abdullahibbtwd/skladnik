const INTRO =
  'You are a document extraction engine for a Bulgarian retail ERP system. You will be shown a photo of one of these document types: purchase invoice (Търговски документ), goods receipt (Стокова разписка), warehouse dispatch (Складова разписка — Изписване), or credit/debit note (Кредитно/дебитно известие).';

const RULES = {
  parties:
    'Identify the supplier and client by their printed LABEL (Доставчик = supplier, Клиент/Получател = client), never by position on the page — some documents print supplier first, others print client first.',
  rows: 'Extract every line item row exactly as printed. Do not summarize, merge, or skip rows.',
  name: 'ocrDescription is the product name only, as printed in the name column. Leave out batch/lot numbers (Партида, П-да, Лот), expiry dates (Годен до, Срок на годност), barcodes and article codes, even when they are printed next to the name — they go in their own fields.',
  codes:
    'supplierCode is the supplier\'s article code (Код, Арт. №, Кат. №). barcode is the EAN/GTIN (Баркод, EAN) — 8, 12, 13 or 14 digits. Return null for a field that is not printed; do not copy one into the other.',
  batch:
    'Batch number and expiry date are printed per line item, in their own columns (Партида, Годен до) or after the name — extract them per line, not once for the whole document. If a line has no batch/expiry printed, return null for those fields, do not guess.',
  units: 'Preserve unit strings exactly as printed (e.g. "бр.", "пак", "кг", "стек", "кашон") — do not translate or normalize them.',
  page: 'If a document spans multiple pages, only extract what is visible in THIS photo — do not reference other pages.',
  numbers: 'Numbers: extract numeric values only, no currency symbols, using "." as the decimal separator regardless of how it\'s printed.',
  dates:
    'Dates (issuedOn, ocrExpiryDate) must be YYYY-MM-DD. Convert printed Bulgarian dates like 15.09.2026г. to 2026-09-15. documentNumber is only the printed № — do not append the date.',
  totals:
    'Document totals: copy them exactly as printed at the bottom of the document — taxableBase = "Данъчна основа" / "Сума без ДДС", vatAmount = "ДДС" / "Начислен ДДС", grossTotal = "Сума за плащане" / "Обща сума" / "Всичко". Never calculate them from the lines; return null if they are not printed in THIS photo.',
  lineTotal: 'lineTotal is the printed "Стойност" / "Сума" column of the row, copied as printed. Do not multiply quantity by price yourself.',
  payment:
    'paymentMethod from "Начин на плащане": "В брой" = "CASH", "С карта" / "ПОС" = "CARD", "По банков път" / "Банков превод" = "BANK_TRANSFER", anything else printed = "OTHER", null if not printed.',
  json: 'Return ONLY valid JSON matching the schema below. No explanation, no markdown code fences, no extra text before or after the JSON.',
};

const HEADER_SCHEMA = `  "documentNumber": string | null,
  "issuedOn": string | null,
  "documentType": "INVOICE" | "RECEIPT" | "PROTOCOL" | "CREDIT_NOTE" | null,
  "supplier": {
    "name": string | null,
    "taxId": string | null,
    "address": string | null,
    "mol": string | null,
    "phone": string | null
  },
  "client": {
    "name": string | null,
    "taxId": string | null,
    "address": string | null
  },
  "deliveryAddress": string | null,`;

const LINES_SCHEMA = `  "lines": [
    {
      "supplierCode": string | null,
      "barcode": string | null,
      "ocrDescription": string,
      "ocrUnit": string | null,
      "qty": number,
      "unitPrice": number | null,
      "discountPercent": number | null,
      "finalUnitPrice": number | null,
      "lineTotal": number | null,
      "vatRate": number | null,
      "ocrBatchNumber": string | null,
      "ocrExpiryDate": string | null
    }
  ],`;

const TOTALS_SCHEMA = `  "taxableBase": number | null,
  "vatAmount": number | null,
  "grossTotal": number | null,
  "paymentMethod": "CASH" | "CARD" | "BANK_TRANSFER" | "OTHER" | null,`;

function prompt(rules: string[], schema: string[]) {
  const numbered = rules.map((rule, index) => `${index + 1}. ${rule}`).join('\n');
  return `${INTRO}\n\nRULES:\n${numbered}\n\nSCHEMA:\n{\n${schema.join('\n')}\n  "confidence": "high" | "medium" | "low"\n}`;
}

export const DOCUMENT_EXTRACTION_PROMPT = prompt(
  [RULES.parties, RULES.rows, RULES.name, RULES.codes, RULES.batch, RULES.units, RULES.page, RULES.numbers, RULES.dates, RULES.totals, RULES.lineTotal, RULES.payment, RULES.json],
  [HEADER_SCHEMA, LINES_SCHEMA, TOTALS_SCHEMA],
);

/** Header, parties and printed totals only: small output, so a faster model can read it alongside the lines. */
export const HEADER_EXTRACTION_PROMPT = prompt(
  [RULES.parties, RULES.page, RULES.numbers, RULES.dates, RULES.totals, RULES.payment, 'Do not extract the line items.', RULES.json],
  [HEADER_SCHEMA, TOTALS_SCHEMA],
);

/**
 * Appended to cut what the model has to write (reading time is mostly output tokens): no
 * indentation, and no line fields that would be null.
 */
export const COMPACT_OUTPUT_RULE =
  '\n\nOUTPUT SIZE: write the JSON on a single line with no indentation or spaces between tokens. Inside "lines", leave out every key whose value would be null.';

export const LINES_EXTRACTION_PROMPT = prompt(
  [RULES.rows, RULES.name, RULES.codes, RULES.batch, RULES.units, RULES.page, RULES.numbers, RULES.dates, RULES.lineTotal, 'Do not extract the header, parties or document totals.', RULES.json],
  [LINES_SCHEMA],
);
