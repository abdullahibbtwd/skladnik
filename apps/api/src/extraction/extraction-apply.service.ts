import { Injectable, Logger } from '@nestjs/common';
import { Prisma, type UnitOfMeasure } from '@prisma/client';
import { defaultStockDirection, isPaperDocumentType } from '@skladnik/shared';
import { toNumber } from '../common/decimal';
import { computeLineAmounts } from '../documents/document-pricing';
import { PrismaService } from '../prisma/prisma.service';
import type { ExtractedDocument, ExtractedLine } from './extracted-document.schema';
import {
  counterpartyFromExtracted,
  looksLikeBarcode,
  pendingProductCode,
  resolveUnit,
  unitPriceFromLine,
} from './match-extracted';
import { NameIndex, partnerKey } from './name-matching';
import { cleanDocumentNumber, parseOcrDate } from './parse-ocr-date';

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
      const products = new NameIndex(
        await tx.product.findMany({
          where: { companyId: capture.companyId, status: { not: 'ARCHIVED' } },
          select: { id: true, name: true },
          orderBy: { createdAt: 'asc' },
        }),
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
      // A failed statement aborts the whole Postgres transaction, so unique
      // conflicts have to be avoided up front rather than caught and retried.
      const documentNumber = cleanDocumentNumber(extracted.documentNumber);
      if (documentNumber) {
        const taken = await tx.document.findFirst({
          where: { companyId: capture.companyId, number: documentNumber, id: { not: capture.documentId } },
          select: { id: true },
        });
        if (!taken) header.number = documentNumber;
      }
      if (partnerId && !capture.document.partnerId) {
        header.partner = { connect: { id: partnerId } };
      }

      await tx.document.update({ where: { id: capture.documentId }, data: header });

      await tx.documentLine.deleteMany({ where: { sourceCaptureId: capture.id } });
      const remaining = await tx.documentLine.findMany({
        where: { documentId: capture.documentId },
        select: { position: true },
      });
      let position = remaining.length === 0 ? 0 : Math.max(...remaining.map((row) => row.position)) + 1;

      for (const [index, line] of extracted.lines.entries()) {
        const matched = await this.matchOrCreateProduct(tx, {
          companyId: capture.companyId,
          documentId: capture.documentId,
          supplierId: outgoing ? null : (partnerId ?? capture.document.partnerId),
          line,
          aliases,
          products,
          index,
        });
        const quantity = line.qty > 0 ? line.qty : 0;
        const unitPrice = unitPriceFromLine(line);
        const amounts = computeLineAmounts(quantity || 1, unitPrice, line.discountPercent ?? 0);
        await tx.documentLine.create({
          data: {
            companyId: capture.companyId,
            documentId: capture.documentId,
            sourceCaptureId: capture.id,
            productId: matched.id,
            position,
            supplierProductCode: line.supplierCode,
            ocrDescription: line.ocrDescription || matched.name,
            ocrUnit: line.ocrUnit,
            unit: matched.unit,
            quantity,
            unitPrice,
            discountPercent: amounts.discountPercent,
            finalUnitPrice: line.finalUnitPrice ?? amounts.finalUnitPrice,
            lineTotal: line.lineTotal ?? amounts.lineTotal,
            vatRate: line.vatRate ?? toNumber(matched.vatRate),
            ocrBatchNumber: line.ocrBatchNumber,
            ocrExpiryDate: parseOcrDate(line.ocrExpiryDate),
            verified: false,
          },
        });
        position += 1;
      }

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

    this.logger.log(`Applied OCR to capture ${captureId} (${extracted.lines.length} lines, ${extracted.confidence})`);
  }

  private async matchOrCreatePartner(
    tx: Prisma.TransactionClient,
    companyId: string,
    party: { name: string | null; taxId: string | null; address: string | null; mol?: string | null; phone?: string | null },
    kind: 'SUPPLIER' | 'CUSTOMER',
  ) {
    const taxId = party.taxId?.trim() || null;
    const name = party.name?.trim() || null;
    if (!taxId && !name) return null;

    const matched =
      (taxId ? await tx.partner.findFirst({ where: { companyId, taxId }, select: { id: true, name: true, kind: true } }) : null) ??
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

    const data = {
      companyId,
      kind,
      name: name ?? taxId ?? (kind === 'CUSTOMER' ? 'Unknown customer' : 'Unknown supplier'),
      taxId,
      address: party.address?.trim() || null,
      mol: party.mol?.trim() || null,
      phone: party.phone?.trim() || null,
    };
    const created = taxId
      ? await tx.partner.upsert({
          where: { companyId_taxId: { companyId, taxId } },
          update: {},
          create: data,
          select: { id: true },
        })
      : await tx.partner.create({ data, select: { id: true } });
    return created.id;
  }

  private async matchOrCreateProduct(
    tx: Prisma.TransactionClient,
    input: {
      companyId: string;
      documentId: string;
      /** Only set for incoming documents; supplier codes belong to suppliers. */
      supplierId: string | null;
      line: ExtractedLine;
      aliases: { raw: string; unit: UnitOfMeasure }[];
      products: NameIndex<{ id: string; name: string }>;
      index: number;
    },
  ) {
    const supplierCode = input.line.supplierCode?.trim() || null;
    const description = input.line.ocrDescription.trim();

    if (supplierCode && input.supplierId) {
      const mapped = await tx.supplierProductCode.findFirst({
        where: { companyId: input.companyId, partnerId: input.supplierId, supplierCode },
        include: { product: true },
      });
      if (mapped?.product && mapped.product.status !== 'ARCHIVED') {
        return mapped.product;
      }
    }

    if (looksLikeBarcode(supplierCode)) {
      const barcode = await tx.productBarcode.findFirst({
        where: { companyId: input.companyId, barcode: supplierCode! },
        include: { product: true },
      });
      if (barcode?.product && barcode.product.status !== 'ARCHIVED') {
        await this.rememberSupplierCode(tx, input.companyId, input.supplierId, barcode.product.id, supplierCode);
        return barcode.product;
      }
    }

    if (supplierCode) {
      const byCode = await tx.product.findFirst({
        where: { companyId: input.companyId, code: supplierCode, status: { not: 'ARCHIVED' } },
      });
      if (byCode) {
        await this.rememberSupplierCode(tx, input.companyId, input.supplierId, byCode.id, supplierCode);
        return byCode;
      }
    }

    const nameMatch = description ? input.products.find(description) : null;
    if (nameMatch) {
      const byName = await tx.product.findUniqueOrThrow({ where: { id: nameMatch.id } });
      await this.rememberSupplierCode(tx, input.companyId, input.supplierId, byName.id, supplierCode);
      return byName;
    }

    const unit = resolveUnit(input.line.ocrUnit, input.aliases);
    const unitPrice = unitPriceFromLine(input.line);
    const created = await tx.product.create({
      data: {
        companyId: input.companyId,
        name: description || supplierCode || `OCR line ${input.index + 1}`,
        code: pendingProductCode(description || supplierCode || 'line', input.index),
        unit,
        vatRate: input.line.vatRate ?? 20,
        purchasePrice: unitPrice,
        sellingPrice: unitPrice,
        batchTracking: Boolean(input.line.ocrBatchNumber || input.line.ocrExpiryDate),
        status: 'PENDING_REVIEW',
        createdFromDocumentId: input.documentId,
      },
    });
    input.products.add({ id: created.id, name: created.name });
    await this.rememberSupplierCode(tx, input.companyId, input.supplierId, created.id, supplierCode);
    return created;
  }

  private async rememberSupplierCode(
    tx: Prisma.TransactionClient,
    companyId: string,
    partnerId: string | null,
    productId: string,
    supplierCode: string | null,
  ) {
    if (!partnerId || !supplierCode) return;
    await tx.supplierProductCode.createMany({
      data: [{ companyId, partnerId, productId, supplierCode }],
      skipDuplicates: true,
    });
  }
}
