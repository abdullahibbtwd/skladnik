/**
 * Shared submit/post lifecycle checks (Staff QA SKL-01 / SKL-02 / SKL-03 / SKL-10).
 * One function drives both submit-for-review and post so the API cannot bypass the UI.
 */
import { documentDateIssue, documentNumbersMatch, normalizeDocumentNumber, type TotalsCheck } from '@skladnik/shared';
import { scanLineChecks } from '../extraction/quantity-cell';
import { dateWarning, headerErrors, postingErrors, type PostingDocument, type PostingLine } from './can-document-be-posted';

export type LifecycleIssue = {
  code: string;
  message: string;
  params?: Record<string, string | number | boolean | null | undefined>;
};

export type LifecycleInput = PostingDocument & {
  number: string;
  issuedOn: string;
  partnerId?: string | null;
  totals: TotalsCheck | null;
  /** Partner / master-data messages that block post but never Staff submit (SKL-08). */
  masterDataIssues?: LifecycleIssue[];
  scanFirstLineNumber?: number | null;
  amountInWordsParsed?: number | null;
};

export type LifecycleResult = {
  /** Blocks submit-for-review and post. */
  blockBoth: LifecycleIssue[];
  /** Blocks post; Staff may still submit — shown to the reviewer. */
  blockPost: LifecycleIssue[];
  /** Post needs explicit confirmation (not blocking submit). */
  needsConfirm: LifecycleIssue[];
};

const EMPTY_LINES: LifecycleIssue = {
  code: 'DOCUMENT_EMPTY_LINES',
  message: 'Добавете поне един ред преди осчетоводяване',
};

function futureDateIssue(issuedOn: string, today: string): LifecycleIssue | null {
  if (documentDateIssue(issuedOn, today) !== 'FUTURE') return null;
  return {
    code: 'DOCUMENT_DATE_FUTURE',
    message: `Датата на документа ${issuedOn} е в бъдещето. Сверете я с хартиения документ.`,
    params: { date: issuedOn },
  };
}

/** Document № equals a line's batch number — typical OCR mix-up of header vs lot column (SKL-01). */
export function numberEqualsBatchIssues(
  documentNumber: string,
  lines: { position: number; ocrBatchNumber: string | null }[],
): LifecycleIssue[] {
  const issues: LifecycleIssue[] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    const batch = line.ocrBatchNumber?.trim();
    if (!batch) continue;
    if (!documentNumbersMatch(documentNumber, batch)) continue;
    const key = normalizeDocumentNumber(batch);
    if (seen.has(key)) continue;
    seen.add(key);
    issues.push({
      code: 'DOCUMENT_NUMBER_EQUALS_BATCH',
      message: `Номерът на документа съвпада с партида „${batch}“ на ред ${line.position + 1}. Вероятно е прочетена колоната за партида вместо номерът.`,
      params: { batch, line: line.position + 1 },
    });
  }
  return issues;
}

/** Document date equals a line expiry — typical OCR mix-up of header date vs срок на годност (SKL-01). */
export function dateEqualsExpiryIssues(
  issuedOn: string,
  lines: { position: number; ocrBatchNumber: string | null; ocrExpiryDate: Date | string | null }[],
): LifecycleIssue[] {
  const issues: LifecycleIssue[] = [];
  for (const line of lines) {
    if (!line.ocrExpiryDate) continue;
    const expiry =
      typeof line.ocrExpiryDate === 'string'
        ? line.ocrExpiryDate.slice(0, 10)
        : line.ocrExpiryDate.toISOString().slice(0, 10);
    if (expiry !== issuedOn) continue;
    const batch = line.ocrBatchNumber?.trim() || '—';
    issues.push({
      code: 'DOCUMENT_DATE_EQUALS_EXPIRY',
      message: `Датата на документа съвпада с годността на ред ${line.position + 1} (партида ${batch}). Сверете дали не е взета датата от колоната за годност.`,
      params: { line: line.position + 1, batch, date: issuedOn },
    });
  }
  return issues;
}

function pendingProductIssues(document: PostingDocument, forStaff: boolean): LifecycleIssue[] {
  if (document.type === 'STOCKTAKE') return [];
  const issues: LifecycleIssue[] = [];
  for (const line of document.lines) {
    if (!line.product || line.product.status !== 'PENDING_REVIEW') continue;
    // SKL-08: Staff must never be pointed at product confirm / settings — contact manager.
    const message = forStaff
      ? `Ред ${line.position + 1}: „${line.product.name}“ е създаден автоматично от сканиране и не е прегледан. Свържете се с мениджър.`
      : `Ред ${line.position + 1}: „${line.product.name}“ е създаден автоматично от сканиране и не е прегледан. Потвърдете го като нов продукт или изберете съществуващ.`;
    issues.push({
      code: 'PENDING_PRODUCT',
      message,
      params: { line: line.position + 1, product: line.product.name },
    });
  }
  return issues;
}

function lineAmount(value: { toString(): string } | number | undefined) {
  if (value == null) return 0;
  const parsed = typeof value === 'number' ? value : Number(value.toString());
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * CAF-01 decision: a totals mismatch stays a warning on submit and blocks posting
 * (Group 13). Staff cannot see prices, so a price-caused mismatch is not theirs to fix.
 * A quantity cell that disagrees with the stored number blocks submit until confirmed.
 */
function scanQuantityIssues(lines: PostingLine[]): { blockBoth: LifecycleIssue[]; blockPost: LifecycleIssue[] } {
  const blockBoth: LifecycleIssue[] = [];
  const blockPost: LifecycleIssue[] = [];
  for (const line of lines) {
    if (!line.ocrUnit) continue;
    const flags = scanLineChecks({
      printed: line.ocrUnit,
      quantity: lineAmount(line.quantity),
      productUnit: line.product?.unit ?? line.unit ?? null,
      quantityConfirmed: line.quantityConfirmed,
      unitConfirmed: line.unitConfirmed,
    });
    if (flags.quantityCheck) {
      blockBoth.push({
        code: 'QUANTITY_CHECK',
        message: `Ред ${line.position + 1}: Проверете количеството. Отпечатаното „${line.ocrUnit}“ не съвпада със записаното. Потвърдете или коригирайте преди изпращане.`,
        params: { line: line.position + 1, printed: line.ocrUnit },
      });
    }
    if (flags.unitCheck) {
      blockPost.push({
        code: 'UNIT_CHECK',
        message: `Ред ${line.position + 1}: Проверете мярката. Отпечатаното „${line.ocrUnit}“ не се превръща в мярката на продукта.`,
        params: { line: line.position + 1, printed: line.ocrUnit },
      });
    }
  }
  return { blockBoth, blockPost };
}

function totalsIssues(totals: TotalsCheck | null): LifecycleIssue[] {
  if (!totals) return [];
  const issues: LifecycleIssue[] = [];
  const money = (value: number) => value.toFixed(2);
  const labels = { taxableBase: 'данъчна основа', vat: 'ДДС', total: 'обща сума' } as const;
  for (const field of totals.mismatched) {
    issues.push({
      code: 'TOTALS_MISMATCH',
      message:
        `Отпечатаната ${labels[field]} ${money(Math.abs(totals.printed[field]!))} не съвпада с редовете (${money(totals.calculated[field])}). ` +
        'Сверете количествата, цените и отстъпките с документа.',
      params: { field },
    });
  }
  if (totals.required && totals.printed.total === null) {
    issues.push({
      code: 'TOTALS_MISSING',
      message: 'Въведете общата сума, отпечатана на документа, за да се свери с редовете.',
    });
  }
  return issues;
}

/** Document types whose lines feed weighted-average cost (must not post at 0,00 without „без стойност“). */
export function costsFromLines(type: string | undefined): boolean {
  return type === 'INVOICE' || type === 'RECEIPT' || type === 'CREDIT_NOTE' || type === 'OPENING_BALANCE';
}

export function zeroPriceIssues(
  type: string | undefined,
  lines: { position: number; unitPrice: number | { toString(): string }; freeOfCharge?: boolean }[],
): LifecycleIssue[] {
  if (!costsFromLines(type)) return [];
  const issues: LifecycleIssue[] = [];
  for (const line of lines) {
    if (line.freeOfCharge) continue;
    const price = typeof line.unitPrice === 'number' ? line.unitPrice : Number(line.unitPrice.toString());
    if (!(price > 0)) {
      issues.push({
        code: 'ZERO_PRICE_LINE',
        message: `Ред ${line.position + 1}: липсва цена (0,00 EUR). Въведете цена или маркирайте „без стойност“ (безплатна стока / мостра).`,
        params: { line: line.position + 1 },
      });
    }
  }
  return issues;
}

/** ACC-04 completeness from scan: missing previous page / amount in words mismatch. */
export function scanCompletenessIssues(input: {
  type?: string;
  scanFirstLineNumber?: number | null;
  amountInWordsParsed?: number | null;
  calculatedTotal?: number | null;
  tolerance?: number;
}): LifecycleIssue[] {
  if (input.type !== 'INVOICE' && input.type !== 'CREDIT_NOTE') return [];
  const issues: LifecycleIssue[] = [];
  if (input.scanFirstLineNumber != null && input.scanFirstLineNumber > 1) {
    issues.push({
      code: 'MISSING_PREVIOUS_PAGE',
      message: `Първият ред на заснетата страница е № ${input.scanFirstLineNumber} — липсва предишна страница. Добавете я с „Добавяне на страница“.`,
      params: { firstLine: input.scanFirstLineNumber },
    });
  }
  const parsed = input.amountInWordsParsed;
  const calc = input.calculatedTotal;
  const tolerance = input.tolerance ?? 0.02;
  if (parsed != null && calc != null && Math.abs(parsed - calc) > tolerance) {
    issues.push({
      code: 'AMOUNT_IN_WORDS_MISMATCH',
      message:
        `Сумата словом (${parsed.toFixed(2)} EUR) не съвпада с редовете (${calc.toFixed(2)} EUR) — може да липсва страница.`,
      params: { words: parsed, lines: calc },
    });
  }
  return issues;
}

function isReclassifiedLegacy(message: string) {
  return (
    /at least one line/i.test(message) ||
    /Добавете поне един ред/.test(message) ||
    /in the future/i.test(message) ||
    /в бъдещето/.test(message) ||
    /hasn't been reviewed/i.test(message) ||
    /не е прегледан/.test(message) ||
    /doesn't match the lines/i.test(message) ||
    /grand total printed/i.test(message) ||
    /не съвпада с редовете/.test(message) ||
    /Въведете общата сума/.test(message)
  );
}

/**
 * Classify document problems for submit vs post.
 *
 * Blocking on both: future date, empty lines.
 * Blocking on post / warning on submit: number=batch, PENDING_REVIEW, totals, other line/header
 *   readiness (missing product/batch, partner required), and master-data (invalid ЕИК / unverified).
 * Confirm on post: date=expiry, old date.
 *
 * @param forStaff — SKL-08: Staff wording never points at /settings; managers get confirm/settings guidance.
 */
export function classifyDocumentLifecycle(
  document: LifecycleInput,
  today: string,
  options?: { forStaff?: boolean },
): LifecycleResult {
  const forStaff = Boolean(options?.forStaff);
  const blockBoth: LifecycleIssue[] = [];
  const blockPost: LifecycleIssue[] = [];
  const needsConfirm: LifecycleIssue[] = [];

  const future = document.type === 'SALE' ? null : futureDateIssue(document.issuedOn, today);
  if (future) blockBoth.push(future);

  if (document.type !== 'STOCKTAKE' && document.lines.length === 0) {
    blockBoth.push(EMPTY_LINES);
  }

  if (document.type !== 'STOCKTAKE') {
    const scanned = scanQuantityIssues(document.lines);
    blockBoth.push(...scanned.blockBoth);
    blockPost.push(...scanned.blockPost);
  }

  blockPost.push(...numberEqualsBatchIssues(document.number, document.lines));
  blockPost.push(...pendingProductIssues(document, forStaff));
  blockPost.push(...totalsIssues(document.totals));
  blockPost.push(
    ...scanCompletenessIssues({
      type: document.type,
      scanFirstLineNumber: document.scanFirstLineNumber,
      amountInWordsParsed: document.amountInWordsParsed,
      calculatedTotal: document.totals?.calculated.total ?? null,
      tolerance: document.totals?.tolerance,
    }),
  );
  blockPost.push(
    ...zeroPriceIssues(
      document.type,
      document.lines.map((line) => ({
        position: line.position,
        unitPrice: line.unitPrice ?? 0,
        freeOfCharge: line.freeOfCharge,
      })),
    ),
  );
  blockPost.push(...(document.masterDataIssues ?? []));

  // Remaining posting/header readiness. Totals + future date are handled above — pass totals null
  // so headerErrors does not duplicate them.
  const legacy = [
    ...postingErrors(document),
    ...headerErrors(
      {
        type: document.type ?? 'INVOICE',
        issuedOn: document.issuedOn,
        partnerId: document.partnerId,
        totals: null,
      },
      today,
    ),
  ];

  for (const message of legacy) {
    if (isReclassifiedLegacy(message)) continue;
    blockPost.push({ code: 'DOCUMENT_NOT_READY', message });
  }

  needsConfirm.push(...dateEqualsExpiryIssues(document.issuedOn, document.lines));
  const old = dateWarning({ type: document.type ?? 'INVOICE', issuedOn: document.issuedOn }, today);
  if (old) {
    needsConfirm.push({
      code: 'DOCUMENT_DATE_OLD',
      message: `Датата на документа ${document.issuedOn} е по-стара от 90 дни. Потвърдете я преди осчетоводяване.`,
      params: { date: document.issuedOn },
    });
  }

  return { blockBoth, blockPost, needsConfirm };
}

export function lifecycleMessages(issues: LifecycleIssue[]): string[] {
  return issues.map((issue) => issue.message);
}
