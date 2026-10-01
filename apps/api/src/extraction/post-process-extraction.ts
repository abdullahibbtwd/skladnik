/**
 * Post-OCR cross-checks (SKL-01): catch header/line mix-ups before the reviewer posts.
 * Lowers fieldConfidence and records warnings; does not invent corrected values.
 */
import { documentNumbersMatch, type DocumentDateIssue, documentDateIssue } from '@skladnik/shared';
import type { ExtractedDocument } from './extracted-document.schema';
import { validateBarcode } from './barcode';

export type ExtractionWarning = {
  code: string;
  message: string;
  field?: string;
};

function bumpLow(
  confidence: ExtractedDocument['fieldConfidence'],
  field: keyof NonNullable<ExtractedDocument['fieldConfidence']>,
) {
  if (!confidence) return;
  confidence[field] = 'low';
}

/** Apply Section A cross-checks right after extraction parse. */
export function postProcessExtraction(
  extracted: ExtractedDocument,
  today: string,
): { document: ExtractedDocument; warnings: ExtractionWarning[] } {
  const warnings: ExtractionWarning[] = [];
  const fieldConfidence = { ...(extracted.fieldConfidence ?? {
    documentNumber: 'medium' as const,
    issuedOn: 'medium' as const,
    supplierName: 'medium' as const,
    supplierTaxId: 'medium' as const,
    grossTotal: 'medium' as const,
  }) };

  const number = extracted.documentNumber?.trim() ?? '';
  if (number) {
    for (const [index, line] of extracted.lines.entries()) {
      const batch = line.ocrBatchNumber?.trim();
      if (batch && documentNumbersMatch(number, batch)) {
        warnings.push({
          code: 'DOCUMENT_NUMBER_EQUALS_BATCH',
          message: `Номерът на документа съвпада с партида „${batch}“ на ред ${index + 1}. Потвърдете ръчно.`,
          field: 'documentNumber',
        });
        bumpLow(fieldConfidence, 'documentNumber');
        break;
      }
    }
  }

  const issuedOn = extracted.issuedOn?.trim() ?? '';
  if (issuedOn) {
    const dateIssue: DocumentDateIssue | null = documentDateIssue(issuedOn, today);
    if (dateIssue === 'FUTURE') {
      warnings.push({
        code: 'DOCUMENT_DATE_FUTURE',
        message: `Датата ${issuedOn} е в бъдещето. Потвърдете я ръчно срещу заглавната част.`,
        field: 'issuedOn',
      });
      bumpLow(fieldConfidence, 'issuedOn');
    }
    for (const [index, line] of extracted.lines.entries()) {
      const expiry = line.ocrExpiryDate?.trim()?.slice(0, 10);
      if (expiry && expiry === issuedOn) {
        warnings.push({
          code: 'DOCUMENT_DATE_EQUALS_EXPIRY',
          message: `Датата на документа съвпада с годността на ред ${index + 1}. Потвърдете я ръчно.`,
          field: 'issuedOn',
        });
        bumpLow(fieldConfidence, 'issuedOn');
        break;
      }
    }
  }

  for (const [index, line] of extracted.lines.entries()) {
    if (!line.barcode?.trim()) continue;
    const check = validateBarcode(line.barcode);
    if (!check.valid) {
      warnings.push({
        code: 'BARCODE_INVALID',
        message: `Ред ${index + 1}: баркодът „${line.barcode}“ е невалиден (${check.reason === 'CHECKSUM' ? 'контролна цифра' : 'дължина'}). Не се ползва за съвпадение.`,
        field: `lines[${index}].barcode`,
      });
    }
  }

  return {
    document: { ...extracted, fieldConfidence, confidence: warnings.length ? 'low' : extracted.confidence },
    warnings,
  };
}
