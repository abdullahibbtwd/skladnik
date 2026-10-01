import { Injectable, Logger } from '@nestjs/common';
import { Prisma, type Product } from '@prisma/client';
import {
  defaultStockDirection,
  isPaperDocumentType,
  normaliseTaxId,
  normalizeDocumentNumber,
  parseBulgarianEuroAmountInWords,
} from '@skladnik/shared';
import { toNumber } from '../common/decimal';
import { deleteOrphanAutoProducts } from '../documents/auto-products';
import { computeLineAmounts } from '../documents/document-pricing';
import { PrismaService } from '../prisma/prisma.service';
import { businessDate } from '../sales/business-day';
import { barcodeForMatching } from './barcode';
import type { ExtractedDocument } from './extracted-document.schema';
import { counterpartyFromExtracted, linePricing, resolveUnit } from './match-extracted';
import { NameIndex, partnerKey, productKey } from './name-matching';
import { cleanDocumentNumber, parseOcrDate } from './parse-ocr-date';
import { postProcessExtraction } from './post-process-extraction';
import { splitProductText } from './product-text';

type MatchableProduct = Product;
export type ProductMatchVia = 'barcode' | 'supplierCode' | 'code' | 'name';

export type PartnerMatchResult = {
  partnerId: string | null;
  /** Extracted ЕИК/VAT differs from the matched partner's record (SKL-06). */
  eikMismatch: { extracted: string; partner: string; partnerName: string } | null;
  /** No match — reviewer must confirm "нов доставчик" (SKL-05). Never auto-created. */
  proposedNew: { name: string | null; taxId: string | null } | null;
};

@Injectable()
export class ExtractionApplyService {
  private readonly logger = new Logger(ExtractionApplyService.name);

  constructor(private readonly prisma: PrismaService) {}

  async apply(captureId: string, extractedInput: ExtractedDocument) {
    const capture = await this.prisma.documentCapture.findUnique({
      where: { id: captureId },
      include: { document: true },
    });
    if (!capture) throw new Error('Capture not found');
    if (capture.document.status !== 'DRAFT' && capture.document.status !== 'REVIEW') {
      throw new Error('Posted or cancelled documents cannot be filled from OCR');
    }
    const currentType = capture.document.type;
    if (!isPaperDocumentType(currentType)) {
      throw new Error('Only supplier and customer paperwork is read by OCR');
    }

    const { document: extracted, warnings: extractionWarnings } = postProcessExtraction(extractedInput, businessDate());

    const via: Record<ProductMatchVia | 'none', number> = { barcode: 0, supplierCode: 0, code: 0, name: 0, none: 0 };
    let partnerMatch: PartnerMatchResult = { partnerId: null, eikMismatch: null, proposedNew: null };
    await this.prisma.$transaction(async (tx) => {
      const aliases = await tx.unitAlias.findMany({
        where: { companyId: capture.companyId },
        select: { raw: true, unit: true },
      });
      const documentType = extracted.documentType ?? currentType;
      const outgoing = defaultStockDirection(documentType) === 'OUT';
      const party = counterpartyFromExtracted(documentType, extracted);
      partnerMatch = await this.matchPartner(tx, capture.companyId, party, outgoing ? 'CUSTOMER' : 'SUPPLIER');
      const partnerId = partnerMatch.partnerId;
      // Only reviewed products: an earlier scan's unreviewed guess must not attract the same misreading again.
      const products = new NameIndex(
        await tx.product.findMany({
          where: { companyId: capture.companyId, status: 'ACTIVE' },
          select: { id: true, name: true },
          orderBy: { createdAt: 'asc' },
        }),
        productKey,
        0.88,
        true,
      );

      const header: Prisma.DocumentUpdateInput = {};
      if (extracted.documentType) {
        header.type = extracted.documentType;
        header.direction = defaultStockDirection(extracted.documentType);
      }
      // Header date only — never parse a date out of the document number (lot/expiry mix-up, SKL-01).
      const issuedOn = parseOcrDate(extracted.issuedOn);
      if (issuedOn) header.issuedOn = issuedOn;
      if (extracted.deliveryAddress && !capture.document.deliveryAddress) {
        header.deliveryAddress = extracted.deliveryAddress;
      }
      const documentNumber = cleanDocumentNumber(extracted.documentNumber);
      if (documentNumber) {
        header.number = documentNumber;
        header.numberKey = normalizeDocumentNumber(documentNumber);
      }
      if (partnerId && !capture.document.partnerId) {
        header.partner = { connect: { id: partnerId } };
      }
      if (extracted.taxableBase !== null) header.printedTaxableBase = extracted.taxableBase;
      if (extracted.vatAmount !== null) header.printedVatAmount = extracted.vatAmount;
      if (extracted.grossTotal !== null) header.printedTotal = extracted.grossTotal;
      if (extracted.paymentMethod !== null) header.paymentMethod = extracted.paymentMethod;
      // ACC-04 completeness signals from the scan.
      const firstPrinted = extracted.lines
        .map((row) => row.printedLineNumber)
        .filter((n): n is number => typeof n === 'number' && n > 0)
        .sort((a, b) => a - b)[0];
      if (firstPrinted != null) header.scanFirstLineNumber = Math.trunc(firstPrinted);
      if (extracted.amountInWords) {
        header.amountInWords = extracted.amountInWords;
        header.amountInWordsParsed = parseBulgarianEuroAmountInWords(extracted.amountInWords);
      }

      await tx.document.update({ where: { id: capture.documentId }, data: header });

      await tx.documentLine.deleteMany({ where: { sourceCaptureId: capture.id } });
      const remaining = await tx.documentLine.findMany({
        where: { documentId: capture.documentId },
        select: { position: true },
      });
      let position = remaining.length === 0 ? 0 : Math.max(...remaining.map((row) => row.position)) + 1;

      const supplierId = outgoing ? null : (partnerId ?? capture.document.partnerId);
      for (const line of extracted.lines) {
        const text = splitProductText(line.ocrDescription, line.supplierCode);
        const supplierCode = line.supplierCode?.trim() || text.code;
        // Keep the printed barcode on the line; matching uses only checksum-valid ones (SKL-06).
        const rawBarcode =
          [line.barcode, text.barcode].map((value) => value?.trim()).find(Boolean) ??
          (supplierCode && barcodeForMatching(supplierCode) ? supplierCode : null);
        const matchBarcode = barcodeForMatching(rawBarcode);
        const match = await this.matchProduct(tx, {
          companyId: capture.companyId,
          supplierId,
          supplierCode,
          barcode: matchBarcode,
          name: text.name,
          products,
        });
        via[match?.via ?? 'none'] += 1;
        const matched = match?.product ?? null;
        const quantity = line.qty > 0 ? line.qty : 0;
        const { unitPrice, discountPercent } = linePricing(line);
        const amounts = computeLineAmounts(quantity, unitPrice, discountPercent);
        await tx.documentLine.create({
          data: {
            companyId: capture.companyId,
            documentId: capture.documentId,
            sourceCaptureId: capture.id,
            productId: matched?.id ?? null,
            position,
            supplierProductCode: supplierCode,
            ocrBarcode: rawBarcode,
            ocrDescription: line.ocrDescription || text.name,
            ocrUnit: line.ocrUnit,
            unit: matched?.unit ?? resolveUnit(line.ocrUnit, aliases),
            quantity,
            unitPrice,
            discountPercent: amounts.discountPercent,
            finalUnitPrice: amounts.finalUnitPrice,
            lineTotal: amounts.lineTotal,
            ocrLineTotal: line.lineTotal,
            vatRate: line.vatRate ?? (matched ? toNumber(matched.vatRate) : 20),
            ocrBatchNumber: line.ocrBatchNumber ?? text.batch,
            ocrExpiryDate: parseOcrDate(line.ocrExpiryDate) ?? parseOcrDate(text.expiry),
            verified: false,
          },
        });
        position += 1;
      }
      await deleteOrphanAutoProducts(tx, capture.companyId, capture.documentId);

      await tx.documentCapture.update({
        where: { id: capture.id },
        data: {
          ocrRaw: {
            ...extracted,
            extractionWarnings,
            partnerMatch: {
              eikMismatch: partnerMatch.eikMismatch,
              proposedNew: partnerMatch.proposedNew,
            },
          } as Prisma.InputJsonValue,
          extractionStatus: 'SUCCEEDED',
          extractionError: null,
          confidence: extracted.confidence,
        },
      });
    });

    this.logger.log(
      `Applied OCR to capture ${captureId} (${extracted.lines.length} lines, ${extracted.confidence}; matched by ` +
        `${Object.entries(via).map(([key, count]) => `${key} ${count}`).join(', ')}; warnings ${extractionWarnings.length})`,
    );
  }

  /**
   * Match by ЕИК/VAT first, then fuzzy name. Never silently create a partner from a scan (SKL-05).
   * Unmatched → proposedNew for the reviewer ("нов доставчик", unverified on confirm).
   */
  private async matchPartner(
    tx: Prisma.TransactionClient,
    companyId: string,
    party: { name: string | null; taxId: string | null; address: string | null; mol?: string | null; phone?: string | null },
    kind: 'SUPPLIER' | 'CUSTOMER',
  ): Promise<PartnerMatchResult> {
    const printed = normaliseTaxId(party.taxId);
    const vatNumber = /^[A-Z]{2}/.test(printed) ? printed : null;
    const eik = /^BG\d{9,13}$/.test(printed) ? printed.slice(2) : /^\d+$/.test(printed) ? printed : null;
    const name = party.name?.trim() || null;
    const extractedTax = eik || vatNumber || null;
    if (!eik && !vatNumber && !name) {
      return { partnerId: null, eikMismatch: null, proposedNew: null };
    }

    const byNumber = [...(eik ? [{ eik }] : []), ...(vatNumber ? [{ vatNumber }] : [])];
    const matchedByNumber =
      byNumber.length > 0
        ? await tx.partner.findFirst({
            where: { companyId, OR: byNumber },
            select: { id: true, name: true, kind: true, eik: true, vatNumber: true },
            orderBy: { createdAt: 'asc' },
          })
        : null;
    const matchedByName =
      !matchedByNumber && name
        ? new NameIndex(
            await tx.partner.findMany({
              where: { companyId },
              select: { id: true, name: true, kind: true, eik: true, vatNumber: true },
              orderBy: { createdAt: 'asc' },
            }),
            partnerKey,
          ).find(name)
        : null;
    const matched = matchedByNumber ?? matchedByName;

    if (!matched) {
      return { partnerId: null, eikMismatch: null, proposedNew: { name, taxId: extractedTax } };
    }

    if (matched.kind !== kind && matched.kind !== 'BOTH') {
      await tx.partner.update({ where: { id: matched.id }, data: { kind: 'BOTH' } });
    }

    let eikMismatch: PartnerMatchResult['eikMismatch'] = null;
    if (extractedTax) {
      const partnerTax = matched.vatNumber || matched.eik || '';
      const a = normaliseTaxId(extractedTax).replace(/^BG/, '');
      const b = normaliseTaxId(partnerTax).replace(/^BG/, '');
      if (a && b && a !== b) {
        eikMismatch = { extracted: extractedTax, partner: partnerTax, partnerName: matched.name };
      }
    }

    return { partnerId: matched.id, eikMismatch, proposedNew: null };
  }

  /** Barcode (checksum-valid only), then the supplier's code, then the name. */
  private async matchProduct(
    tx: Prisma.TransactionClient,
    input: {
      companyId: string;
      supplierId: string | null;
      supplierCode: string | null;
      barcode: string | null;
      name: string;
      products: NameIndex<{ id: string; name: string }>;
    },
  ): Promise<{ product: MatchableProduct; via: ProductMatchVia } | null> {
    const usable = (product: MatchableProduct | null | undefined) => (product?.status === 'ACTIVE' ? product : null);
    const { companyId, supplierId, supplierCode } = input;

    if (input.barcode) {
      const row = await tx.productBarcode.findFirst({ where: { companyId, barcode: input.barcode }, include: { product: true } });
      const product = usable(row?.product);
      if (product) {
        await rememberSupplierCode(tx, companyId, supplierId, product.id, supplierCode);
        return { product, via: 'barcode' };
      }
    }

    if (supplierCode && supplierId) {
      const mapped = await tx.supplierProductCode.findFirst({
        where: { companyId, partnerId: supplierId, supplierCode, product: { status: 'ACTIVE' } },
        include: { product: true },
      });
      if (mapped) return { product: mapped.product, via: 'supplierCode' };
    }

    if (supplierCode) {
      const product = await tx.product.findFirst({ where: { companyId, code: supplierCode, status: 'ACTIVE' } });
      if (product) {
        await rememberSupplierCode(tx, companyId, supplierId, product.id, supplierCode);
        return { product, via: 'code' };
      }
    }

    const byName = input.name ? input.products.find(input.name) : null;
    if (byName) {
      const product = await tx.product.findUniqueOrThrow({ where: { id: byName.id } });
      await rememberSupplierCode(tx, companyId, supplierId, product.id, supplierCode);
      return { product, via: 'name' };
    }
    return null;
  }
}

/**
 * Remembers which of our products a supplier's code means. Automatic matches only fill a gap;
 * `overwrite` is for a person's choice on the review screen, which replaces an earlier mapping.
 */
export async function rememberSupplierCode(
  tx: Prisma.TransactionClient,
  companyId: string,
  partnerId: string | null,
  productId: string,
  supplierCode: string | null,
  overwrite = false,
) {
  if (!partnerId || !supplierCode) return;
  if (!overwrite) {
    await tx.supplierProductCode.createMany({ data: [{ companyId, partnerId, productId, supplierCode }], skipDuplicates: true });
    return;
  }
  await tx.supplierProductCode.upsert({
    where: { companyId_partnerId_supplierCode: { companyId, partnerId, supplierCode } },
    create: { companyId, partnerId, productId, supplierCode },
    update: { productId },
  });
}
