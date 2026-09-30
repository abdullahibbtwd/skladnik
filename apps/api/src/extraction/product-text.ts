/**
 * Invoices often print batch, expiry, article code and barcode inside the name cell
 * ("58013-Масло 82% 125 г, партида MS-1010, годно до 20.11.2026"). Matching and new product names
 * use the bare name; the other parts fill the line's own fields when the model left them empty.
 */
export type ProductText = {
  name: string;
  batch: string | null;
  expiry: string | null;
  code: string | null;
  barcode: string | null;
};

// \b is ASCII-only in JS, so word edges are written with \p{L} lookarounds.
const DATE = String.raw`\d{1,2}[./-]\d{1,2}[./-](?:\d{4}|\d{2})(?:\s*г\.?)?|\d{4}-\d{2}-\d{2}`;
const EXPIRY = new RegExp(
  String.raw`(?<!\p{L})(?:годн[оаи]\s+до|годен\s+до|срок(?:\s+на\s+годност)?(?:\s+до)?|най-добър\s+до|exp(?:iry)?\.?|best\s+before|г\.\s?д\.?)(?!\p{L})\s*[:\-]?\s*(${DATE})`,
  'iu',
);
const BATCH = new RegExp(
  String.raw`(?<!\p{L})(?:партида|парт\.|п-да|лот|lot|batch|серия)(?!\p{L})\s*[:№#.]?\s*([\p{L}\d][\p{L}\d\-/.]*[\p{L}\d]|[\p{L}\d])`,
  'iu',
);
const BARCODE = /(?<!\d)(\d{13})(?!\d)/u;
const LEADING_CODE = /^\s*(\d{3,}[\p{L}\d]*|[\p{Lu}]{1,3}-?\d{3,})\s*[-–:.]\s*(?=\p{L})/u;

const tidy = (text: string) =>
  text
    .replace(/[([][\s,;:.\-–]*[)\]]/g, ' ')
    .replace(/\s*[,;]\s*(?=[,;]|$)/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s,;:\-–]+|[\s,;:\-–]+$/g, '')
    .trim();

export function splitProductText(raw: string, supplierCode?: string | null): ProductText {
  let text = raw.normalize('NFKC').replace(/\s+/g, ' ').trim();
  let expiry: string | null = null;
  let batch: string | null = null;
  let code: string | null = null;
  let barcode: string | null = null;

  const expiryMatch = text.match(EXPIRY);
  if (expiryMatch) {
    expiry = expiryMatch[1].replace(/\s*г\.?$/u, '');
    text = text.replace(expiryMatch[0], ' ');
  }
  const batchMatch = text.match(BATCH);
  if (batchMatch) {
    batch = batchMatch[1];
    text = text.replace(batchMatch[0], ' ');
  }

  const known = supplierCode?.trim();
  if (known && text.toLowerCase().startsWith(known.toLowerCase())) {
    const rest = text.slice(known.length);
    if (/^\s*[-–:.\s]/.test(rest)) {
      code = known;
      text = rest;
    }
  }
  if (!code) {
    const leading = text.match(LEADING_CODE);
    if (leading) {
      code = leading[1];
      text = text.slice(leading[0].length);
    }
  }

  const barcodeMatch = text.match(BARCODE);
  if (barcodeMatch) {
    barcode = barcodeMatch[1];
    text = text.replace(barcodeMatch[0], ' ');
  }

  const name = tidy(text);
  return { name: name || tidy(raw), batch, expiry, code, barcode };
}
