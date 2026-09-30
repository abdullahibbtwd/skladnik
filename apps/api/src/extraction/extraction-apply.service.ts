import { Injectable, Logger } from '@nestjs/common';
import { Prisma, type Product } from '@prisma/client';
import { defaultStockDirection, isPaperDocumentType, normaliseTaxId } from '@skladnik/shared';
import { toNumber } from '../common/decimal';
import { deleteOrphanAutoProducts } from '../documents/auto-products';
import { computeLineAmounts } from '../documents/document-pricing';
import { PrismaService } from '../prisma/prisma.service';
import type { ExtractedDocument } from './extracted-document.schema';
import { counterpartyFromExtracted, linePricing, looksLikeBarcode, resolveUnit } from './match-extracted';
import { NameIndex, partnerKey, productKey } from './name-matching';
import { cleanDocumentNumber, parseOcrDate } from './parse-ocr-date';
import { splitProductText } from './product-text';

type MatchableProduct = Product;
export type ProductMatchVia = 'barcode' | 'supplierCode' | 'code' | 'name';

@Injectable()
export class ExtractionApplyService {
  private readonly logger = new Logger(ExtractionApplyService.name);

  constructor(private readonly prisma: PrismaService) {}

  async apply(captureId: string, extracted: ExtractedDocument) {
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

    const via: Record<ProductMatchVia | 'none', number> = { barcode: 0, supplierCode: 0, code: 0, name: 0, none: 0 };
    await this.prisma.$transaction(async (tx) => {
      const aliases = await tx.unitAlias.findMany({
        where: { companyId: capture.companyId },
        select: { raw: true, unit: true },
      });
      const documentType = extracted.documentType ?? currentType;
      const outgoing = defaultStockDirection(documentType) === 'OUT';
      const party = counterpartyFromExtracted(documentType, extracted);
      const partnerId = await this.matchOrCreatePartner(
        tx,
        capture.companyId,
        party,
        outgoing ? 'CUSTOMER' : 'SUPPLIER',
      );
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
      const issuedOn = parseOcrDate(extracted.issuedOn) ?? parseOcrDate(extracted.documentNumber);
      if (issuedOn) header.issuedOn = issuedOn;
      if (extracted.deliveryAddress && !capture.document.deliveryAddress) {
        header.deliveryAddress = extracted.deliveryAddress;
      }
      // A number already used by this supplier is still filled in: the review screen then links to the
      // other document and posting is blocked until someone decides which one is real.
      const documentNumber = cleanDocumentNumber(extracted.documentNumber);
      if (documentNumber) header.number = documentNumber;
      if (partnerId && !capture.document.partnerId) {
        header.partner = { connect: { id: partnerId } };
      }
      // Totals are printed once, usually on the last page; a page without them leaves what is there.
      if (extracted.taxableBase !== null) header.printedTaxableBase = extracted.taxableBase;
      if (extracted.vatAmount !== null) header.printedVatAmount = extracted.vatAmount;
      if (extracted.grossTotal !== null) header.printedTotal = extracted.grossTotal;
      if (extracted.paymentMethod !== null) header.paymentMethod = extracted.paymentMethod;

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
        const barcode = [line.barcode, supplierCode, text.barcode].map((value) => value?.trim()).find(looksLikeBarcode) ?? null;
        const match = await this.matchProduct(tx, {
          companyId: capture.companyId,
          supplierId,
          supplierCode,
          barcode,
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
            // Unmatched lines stay unlinked: a product is only created when someone chooses to.
            productId: matched?.id ?? null,
            position,
            supplierProductCode: supplierCode,
            ocrBarcode: barcode,
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
      // Re-reading a page replaces its lines; products an earlier reading guessed for them go too.
      await deleteOrphanAutoProducts(tx, capture.companyId, capture.documentId);

      await tx.documentCapture.update({
        where: { id: capture.id },
        data: {
          ocrRaw: extracted as Prisma.InputJsonValue,
          extractionStatus: 'SUCCEEDED',
          extractionError: null,
          confidence: extracted.confidence,
        },
      });
    });

    this.logger.log(
      `Applied OCR to capture ${captureId} (${extracted.lines.length} lines, ${extracted.confidence}; matched by ` +
        `${Object.entries(via).map(([key, count]) => `${key} ${count}`).join(', ')})`,
    );
  }

  private async matchOrCreatePartner(
    tx: Prisma.TransactionClient,
    companyId: string,
    party: { name: string | null; taxId: string | null; address: string | null; mol?: string | null; phone?: string | null },
    kind: 'SUPPLIER' | 'CUSTOMER',
  ) {
    const printed = normaliseTaxId(party.taxId);
    // One printed number: "BG…" is the VAT number (its digits are the ЕИК), bare digits are the ЕИК.
    const vatNumber = /^[A-Z]{2}/.test(printed) ? printed : null;
    const eik = /^BG\d{9,13}$/.test(printed) ? printed.slice(2) : /^\d+$/.test(printed) ? printed : null;
    const name = party.name?.trim() || null;
    if (!eik && !vatNumber && !name) return null;

    const byNumber = [...(eik ? [{ eik }] : []), ...(vatNumber ? [{ vatNumber }] : [])];
    const matched =
      (byNumber.length
        ? await tx.partner.findFirst({
            where: { companyId, OR: byNumber },
            select: { id: true, name: true, kind: true },
            orderBy: { createdAt: 'asc' },
          })
        : null) ??
      (name
        ? new NameIndex(
            await tx.partner.findMany({
              where: { companyId },
              select: { id: true, name: true, kind: true },
              orderBy: { createdAt: 'asc' },
            }),
            partnerKey,
          ).find(name)
        : null);
    if (matched) {
      if (matched.kind !== kind && matched.kind !== 'BOTH') {
        await tx.partner.update({ where: { id: matched.id }, data: { kind: 'BOTH' } });
      }
      return matched.id;
    }

    // A misread number is still saved: posting refuses it until someone corrects it against the paper.
    const data = {
      companyId,
      kind,
      name: name ?? printed ?? (kind === 'CUSTOMER' ? 'Unknown customer' : 'Unknown supplier'),
      eik,
      vatNumber,
      address: party.address?.trim() || null,
      mol: party.mol?.trim() || null,
      phone: party.phone?.trim() || null,
    };
    const created = eik
      ? await tx.partner.upsert({
          where: { companyId_eik: { companyId, eik } },
          update: {},
          create: data,
          select: { id: true },
        })
      : await tx.partner.create({ data, select: { id: true } });
    return created.id;
  }

  /** Barcode, then the supplier's code (remembered mapping, then our product code), then the name. */
  private async matchProduct(
    tx: Prisma.TransactionClient,
    input: {
      companyId: string;
      /** Only set for incoming documents; supplier codes belong to suppliers. */
      supplierId: string | null;
      supplierCode: string | null;
      barcode: string | null;
      /** Printed name with batch, expiry and codes taken out. */
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
