// Audit F-02 / F-10: purchase invoice L110526 (ВРАЛЯ-ДЕРИТ) was posted with line totals copied from the AI
// reading (7,60 / 2,81 / 3,72 = 14,13 €) while quantity × price is 50,26 €, and dated 12.03.2027 (misread).
// The stock ledger took qty × price, so the document and the ledger disagree.
//
// Two readings fit the numbers, and only the paper can decide between them:
//   - quantities and prices are right, the AI misread the line totals: the ledger is right, the lines are not;
//   - the line totals are right and the quantities were misread (≈0,951 / 0,949 / 0,9 kg): stock is overstated.
//
//   DATABASE_URL=… node scripts/fix-l110526.mjs                         # dry run: prints lines, reading, movements
//   DATABASE_URL=… node scripts/fix-l110526.mjs --issued-on=2026-09-26 \
//     --printed-base=41.88 --printed-vat=8.38 --printed-total=50.26 --payment=BANK_TRANSFER --apply
//   DATABASE_URL=… node scripts/fix-l110526.mjs --quantities=0.951,0.949,0.9 --printed-total=16.96 --apply
//
// Options (lists follow line order; leave an entry empty to keep it, e.g. --prices=,,4.20):
//   --number=L110526 --partner=ВРАЛЯ     which document (partner is a case-insensitive name fragment)
//   --quantities= --prices= --discounts= corrected line values, as printed on the paper
//   --printed-base= --printed-vat= --printed-total= --payment=CASH|CARD|BANK_TRANSFER|OTHER
//   --issued-on=YYYY-MM-DD               the real document date (moves its stock movements too)
//   --apply                              write the fix; refused unless the lines reconcile with the printed totals
import { PrismaClient } from '@prisma/client';
import shared from '@skladnik/shared';

const { documentTotals, reconcileTotals, DOCUMENT_PAYMENT_METHODS } = shared;

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/, '').split('=');
    return [key, rest.length ? rest.join('=') : true];
  }),
);
const apply = args.apply === true;
const number = args.number ?? 'L110526';
const partnerFragment = args.partner ?? 'ВРАЛЯ';

const round = (value, places) => Math.round((value + Number.EPSILON) * 10 ** places) / 10 ** places;
const num = (value) => (value === null || value === undefined ? null : Number(value));
const money = (value) => (value === null ? '—' : value.toFixed(2));

function lineAmounts(quantity, unitPrice, discountPercent) {
  const finalUnitPrice = round(unitPrice * (1 - discountPercent / 100), 4);
  return { finalUnitPrice, lineTotal: round(finalUnitPrice * quantity, 4) };
}

function list(name, count) {
  if (args[name] === undefined) return Array(count).fill(null);
  const values = String(args[name]).split(',');
  if (values.length !== count) throw new Error(`--${name} needs ${count} comma-separated values, got ${values.length}`);
  return values.map((value) => {
    if (value.trim() === '') return null;
    const parsed = Number(value.replace(',', '.'));
    if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`--${name}: "${value}" is not a number`);
    return parsed;
  });
}

function amount(name) {
  if (args[name] === undefined) return undefined;
  const parsed = Number(String(args[name]).replace(',', '.'));
  if (!Number.isFinite(parsed)) throw new Error(`--${name}: "${args[name]}" is not a number`);
  return round(parsed, 2);
}

const prisma = new PrismaClient();

try {
  const matches = await prisma.document.findMany({
    where: {
      number,
      ...(partnerFragment ? { partner: { name: { contains: partnerFragment, mode: 'insensitive' } } } : {}),
    },
    include: {
      company: { select: { name: true } },
      partner: { select: { name: true } },
      site: { select: { name: true } },
      lines: { orderBy: { position: 'asc' }, include: { product: { select: { name: true, batchTracking: true } } } },
      captures: { select: { pageNumber: true, ocrRaw: true, confidence: true }, orderBy: { pageNumber: 'asc' } },
    },
  });
  if (matches.length !== 1) {
    console.log(`Found ${matches.length} document(s) numbered ${number} from a partner matching "${partnerFragment}".`);
    for (const doc of matches) console.log(`  ${doc.id}  ${doc.company.name}  ${doc.partner?.name}  ${doc.status}`);
    process.exitCode = 1;
  } else {
    await run(matches[0]);
  }
} finally {
  await prisma.$disconnect();
}

async function run(doc) {
  const issuedOn = doc.issuedOn.toISOString().slice(0, 10);
  console.log(`${doc.company.name} · ${doc.site.name} · ${doc.type} № ${doc.number} · ${doc.partner?.name}`);
  console.log(`  status ${doc.status}, dated ${issuedOn}, posted ${doc.postedAt?.toISOString() ?? '—'}, VAT period ${doc.vatPeriod ?? 'month of the date'}`);
  console.log(
    `  printed base ${money(num(doc.printedTaxableBase))} · VAT ${money(num(doc.printedVatAmount))} · total ${money(num(doc.printedTotal))} · payment ${doc.paymentMethod ?? '—'}`,
  );

  console.log('\nLines as stored:');
  for (const line of doc.lines) {
    const quantity = num(line.quantity);
    const unitPrice = num(line.unitPrice);
    const discount = num(line.discountPercent);
    const stored = num(line.lineTotal);
    const computed = lineAmounts(quantity, unitPrice, discount).lineTotal;
    const impliedQty = unitPrice > 0 && stored !== null ? round(stored / (unitPrice * (1 - discount / 100)), 3) : null;
    const impliedDiscount = quantity > 0 && unitPrice > 0 && stored !== null ? round((1 - stored / (quantity * unitPrice)) * 100, 2) : null;
    console.log(
      `  ${line.position}. ${line.product?.name ?? line.ocrDescription ?? '?'}: ${quantity} ${line.unit} × ${unitPrice} −${discount}%` +
        ` stored ${money(stored)} vs qty × price ${money(computed)}` +
        ` (stored total implies qty ${impliedQty} at this price, or ${impliedDiscount}% discount at this qty)`,
    );
  }

  for (const capture of doc.captures) {
    const raw = capture.ocrRaw ?? {};
    console.log(`\nAI reading, page ${capture.pageNumber} (confidence ${capture.confidence ?? '—'}):`);
    console.log(`  date ${raw.issuedOn ?? '—'}, number ${raw.documentNumber ?? '—'}`);
    for (const row of raw.lines ?? []) {
      console.log(
        `  "${row.ocrDescription ?? ''}" qty ${row.qty ?? '—'} ${row.ocrUnit ?? ''} × ${row.unitPrice ?? '—'}` +
          ` final ${row.finalUnitPrice ?? '—'} disc ${row.discountPercent ?? '—'} total ${row.lineTotal ?? '—'}`,
      );
    }
    console.log(`  totals: base ${raw.taxableBase ?? '—'}, VAT ${raw.vatAmount ?? '—'}, total ${raw.grossTotal ?? '—'}`);
  }

  const movements = await prisma.stockMovement.findMany({
    where: { documentId: doc.id },
    orderBy: { createdAt: 'asc' },
    include: { batch: { select: { batchNumber: true } } },
  });
  console.log('\nStock movements:');
  for (const move of movements) {
    const value = num(move.quantity) * (num(move.unitCost) ?? 0);
    console.log(
      `  ${move.direction} ${num(move.quantity)} @ ${num(move.unitCost)} = ${money(value)} · line ${move.documentLineId} · batch ${move.batch?.batchNumber ?? '—'} · ${move.occurredAt.toISOString().slice(0, 10)}`,
    );
  }

  // --- The corrected document --------------------------------------------------------------------
  const quantities = list('quantities', doc.lines.length);
  const prices = list('prices', doc.lines.length);
  const discounts = list('discounts', doc.lines.length);
  const nextLines = doc.lines.map((line, index) => {
    const quantity = quantities[index] ?? num(line.quantity);
    const unitPrice = prices[index] ?? num(line.unitPrice);
    const discountPercent = discounts[index] ?? num(line.discountPercent);
    if (discountPercent > 100) throw new Error(`line ${line.position}: discount over 100%`);
    return { line, quantity, unitPrice, discountPercent, ...lineAmounts(quantity, unitPrice, discountPercent) };
  });

  const payment = args.payment;
  if (payment !== undefined && !DOCUMENT_PAYMENT_METHODS.includes(payment)) {
    throw new Error(`--payment must be one of ${DOCUMENT_PAYMENT_METHODS.join(', ')}`);
  }
  const nextIssuedOn = args['issued-on'];
  if (nextIssuedOn !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(nextIssuedOn)) throw new Error('--issued-on must be YYYY-MM-DD');
  const printed = {
    taxableBase: amount('printed-base') ?? num(doc.printedTaxableBase),
    vat: amount('printed-vat') ?? num(doc.printedVatAmount),
    total: amount('printed-total') ?? num(doc.printedTotal),
  };
  const calculated = documentTotals(nextLines.map((row) => ({ net: row.lineTotal, rate: num(row.line.vatRate) })));
  const check = reconcileTotals({ type: doc.type, calculated, printed, lineCount: nextLines.length });

  console.log('\nAfter the fix:');
  for (const row of nextLines) {
    console.log(`  ${row.line.position}. ${row.quantity} × ${row.unitPrice} −${row.discountPercent}% = ${money(row.lineTotal)}`);
  }
  console.log(`  calculated base ${money(calculated.taxableBase)} · VAT ${money(calculated.vat)} · total ${money(calculated.total)}`);
  console.log(`  printed    base ${money(printed.taxableBase)} · VAT ${money(printed.vat)} · total ${money(printed.total)}`);
  console.log(`  check: ${check.status}${check.mismatched.length ? ` (${check.mismatched.join(', ')})` : ''}, tolerance ${check.tolerance}`);

  // Only lines whose received quantity or cost differs from what the ledger recorded touch the ledger.
  const ledgerChanges = nextLines.filter((row) =>
    movements.some(
      (move) =>
        move.documentLineId === row.line.id &&
        move.direction === 'IN' &&
        (num(move.quantity) !== round(row.quantity, 3) || num(move.unitCost) !== row.finalUnitPrice),
    ),
  );
  const blockers = [];
  if (doc.status === 'POSTED' && ledgerChanges.length) {
    const firstMove = movements[0]?.createdAt ?? doc.postedAt ?? new Date(0);
    for (const productId of new Set(ledgerChanges.map((row) => row.line.productId))) {
      const later = await prisma.stockMovement.count({
        where: { siteId: doc.siteId, productId, createdAt: { gt: firstMove }, NOT: { documentId: doc.id } },
      });
      if (later) blockers.push(`${later} later movement(s) of product ${productId} depend on this receipt's quantity and cost`);
    }
  }

  const periods = [...new Set([doc.vatPeriod ?? issuedOn.slice(0, 7), nextIssuedOn?.slice(0, 7)].filter(Boolean))];
  const filings = await prisma.complianceFiling.findMany({
    where: { companyId: doc.companyId, period: { in: periods } },
    select: { kind: true, period: true, version: true },
  });
  for (const filing of filings) {
    console.log(`  note: ${filing.kind} for ${filing.period} (v${filing.version}) was already generated; regenerate it after the fix.`);
  }

  if (!apply) {
    console.log('\nDry run. Compare the lines with the paper, then re-run with the printed values and --apply.');
    if (blockers.length) console.log(`Changing quantities or costs would be refused: ${blockers.join('; ')}. Use a stocktake instead.`);
    return;
  }
  if (!['REVIEW', 'POSTED', 'DRAFT'].includes(doc.status)) throw new Error(`A ${doc.status} document can't be fixed`);
  if (printed.total === null) throw new Error('Pass --printed-total (the grand total on the paper) so the fix can be checked');
  if (check.status !== 'MATCH') throw new Error('The corrected lines still do not add up to the printed totals; nothing was written');
  if (blockers.length) throw new Error(`${blockers.join('; ')}. Correct the stock with a stocktake instead; nothing was written`);

  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtext(${`stock:${doc.siteId}`}))`;
    const before = {
      issuedOn,
      printedTaxableBase: num(doc.printedTaxableBase),
      printedVatAmount: num(doc.printedVatAmount),
      printedTotal: num(doc.printedTotal),
      paymentMethod: doc.paymentMethod,
      lines: doc.lines.map((line) => ({
        id: line.id,
        quantity: num(line.quantity),
        unitPrice: num(line.unitPrice),
        discountPercent: num(line.discountPercent),
        finalUnitPrice: num(line.finalUnitPrice),
        lineTotal: num(line.lineTotal),
      })),
      movements: movements.map((move) => ({ id: move.id, quantity: num(move.quantity), unitCost: num(move.unitCost), occurredAt: move.occurredAt })),
    };

    for (const row of nextLines) {
      await tx.documentLine.update({
        where: { id: row.line.id },
        data: {
          quantity: row.quantity,
          unitPrice: row.unitPrice,
          discountPercent: row.discountPercent,
          finalUnitPrice: row.finalUnitPrice,
          lineTotal: row.lineTotal,
        },
      });
    }

    if (doc.status === 'POSTED') {
      for (const row of ledgerChanges) {
        const moves = movements.filter((move) => move.documentLineId === row.line.id && move.direction === 'IN');
        if (moves.length !== 1) throw new Error(`line ${row.line.position}: expected one IN movement, found ${moves.length}`);
        await tx.stockMovement.update({ where: { id: moves[0].id }, data: { quantity: row.quantity, unitCost: row.finalUnitPrice } });
      }
      await recomputeAverages(tx, doc, ledgerChanges, movements);
    }

    await tx.document.update({
      where: { id: doc.id },
      data: {
        printedTaxableBase: printed.taxableBase,
        printedVatAmount: printed.vat,
        printedTotal: printed.total,
        ...(payment !== undefined ? { paymentMethod: payment } : {}),
        ...(nextIssuedOn ? { issuedOn: new Date(`${nextIssuedOn}T00:00:00Z`) } : {}),
      },
    });
    if (nextIssuedOn) {
      await tx.stockMovement.updateMany({ where: { documentId: doc.id }, data: { occurredAt: new Date(`${nextIssuedOn}T00:00:00Z`) } });
    }

    await tx.activityLog.create({
      data: {
        companyId: doc.companyId,
        userId: null,
        entityType: 'Document',
        entityId: doc.id,
        action: 'DATA_FIX',
        metadata: JSON.parse(
          JSON.stringify({
            reason: 'QA audit F-02/F-10: line totals stored from the AI reading, misread date',
            number: doc.number,
            before,
            after: {
              issuedOn: nextIssuedOn ?? issuedOn,
              printed,
              paymentMethod: payment ?? doc.paymentMethod,
              lines: nextLines.map((row) => ({
                id: row.line.id,
                quantity: row.quantity,
                unitPrice: row.unitPrice,
                discountPercent: row.discountPercent,
                finalUnitPrice: row.finalUnitPrice,
                lineTotal: row.lineTotal,
              })),
              calculated,
            },
          }),
        ),
      },
    });
  });
  console.log(`\nFixed ${doc.number}: ${money(calculated.total)} matches the printed ${money(printed.total)}. Logged as DATA_FIX.`);
}

/**
 * Re-runs the moving average for products whose receipt changed, as if the receipt had been posted
 * correctly. Only called when nothing else has moved those products since, so the stored average is
 * exactly "average before this receipt, plus this receipt".
 */
async function recomputeAverages(tx, doc, ledgerChanges, movements) {
  for (const productId of new Set(ledgerChanges.map((row) => row.line.productId))) {
    const stored = await tx.stockCost.findUnique({ where: { siteId_productId: { siteId: doc.siteId, productId } } });
    const oldIns = movements.filter((move) => move.productId === productId && move.direction === 'IN');
    const oldQty = oldIns.reduce((sum, move) => sum + num(move.quantity), 0);
    const oldValue = oldIns.reduce((sum, move) => sum + num(move.quantity) * num(move.unitCost), 0);
    const [{ onHand }] = await tx.$queryRaw`
      SELECT COALESCE(SUM(CASE WHEN "direction" = 'IN' THEN "quantity" ELSE -"quantity" END), 0)::float8 AS "onHand"
      FROM "StockMovement" WHERE "siteId" = ${doc.siteId} AND "productId" = ${productId} AND ("documentId" IS NULL OR "documentId" <> ${doc.id})
    `;
    let quantity = onHand;
    let average = quantity > 0 && stored ? (num(stored.avgCost) * (quantity + oldQty) - oldValue) / quantity : 0;
    const newIns = await tx.stockMovement.findMany({
      where: { documentId: doc.id, productId, direction: 'IN' },
      orderBy: { createdAt: 'asc' },
    });
    for (const move of newIns) {
      const q = num(move.quantity);
      const cost = num(move.unitCost);
      average = quantity <= 0 ? cost : (quantity * average + q * cost) / (quantity + q);
      quantity += q;
    }
    await tx.stockCost.upsert({
      where: { siteId_productId: { siteId: doc.siteId, productId } },
      create: { companyId: doc.companyId, siteId: doc.siteId, productId, avgCost: round(average, 4) },
      update: { avgCost: round(average, 4) },
    });
  }
}
