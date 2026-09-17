import { Injectable, Logger } from '@nestjs/common';
import { Prisma, type UnitOfMeasure } from '@prisma/client';
import { defaultStockDirection } from '@skladnik/shared';
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

    await this.prisma.$transaction(async (tx) => {
      const aliases = await tx.unitAlias.findMany({
        where: { companyId: capture.companyId },
        select: { raw: true, unit: true },
      });
      const documentType = extracted.documentType ?? capture.document.type;
      const party = counterpartyFromExtracted(documentType, extracted);
      const partnerId = await this.matchOrCreatePartner(tx, capture.companyId, party);

      const header: Prisma.DocumentUpdateInput = {};
      if (extracted.documentType) {
        header.type = extracted.documentType;
        header.direction = defaultStockDirection(extracted.documentType);
      }
      if (extracted.issuedOn) header.issuedOn = new Date(extracted.issuedOn);
      if (extracted.deliveryAddress && !capture.document.deliveryAddress) {
        header.deliveryAddress = extracted.deliveryAddress;
      }
      if (extracted.documentNumber) header.number = extracted.documentNumber.trim();
      if (partnerId && !capture.document.partnerId) {
        header.partner = { connect: { id: partnerId } };
      }

      try {
        await tx.document.update({ where: { id: capture.documentId }, data: header });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          delete header.number;
          await tx.document.update({ where: { id: capture.documentId }, data: header });
        } else {
          throw error;
        }
      }

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
          partnerId: partnerId ?? capture.document.partnerId,
          line,
          aliases,
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
            ocrExpiryDate: line.ocrExpiryDate ? new Date(line.ocrExpiryDate) : null,
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
  ) {
    const taxId = party.taxId?.trim() || null;
    const name = party.name?.trim() || null;
    if (!taxId && !name) return null;

    if (taxId) {
      const byTax = await tx.partner.findFirst({ where: { companyId, taxId } });
      if (byTax) return byTax.id;
    }
    if (name) {
      const byName = await tx.partner.findFirst({
        where: { companyId, name: { equals: name, mode: 'insensitive' } },
      });
      if (byName) return byName.id;
    }

    try {
      const created = await tx.partner.create({
        data: {
          companyId,
          kind: 'SUPPLIER',
          name: name ?? taxId ?? 'Unknown supplier',
          taxId,
          address: party.address?.trim() || null,
          mol: party.mol?.trim() || null,
          phone: party.phone?.trim() || null,
        },
      });
      return created.id;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002' && taxId) {
        const existing = await tx.partner.findFirst({ where: { companyId, taxId } });
        return existing?.id ?? null;
      }
      throw error;
    }
  }

  private async matchOrCreateProduct(
    tx: Prisma.TransactionClient,
    input: {
      companyId: string;
      documentId: string;
      partnerId: string | null;
      line: ExtractedLine;
      aliases: { raw: string; unit: UnitOfMeasure }[];
      index: number;
    },
  ) {
    const supplierCode = input.line.supplierCode?.trim() || null;
    const description = input.line.ocrDescription.trim();

    if (supplierCode && input.partnerId) {
      const mapped = await tx.supplierProductCode.findFirst({
        where: { companyId: input.companyId, partnerId: input.partnerId, supplierCode },
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
        await this.rememberSupplierCode(tx, input.companyId, input.partnerId, barcode.product.id, supplierCode);
        return barcode.product;
      }
    }

    if (supplierCode) {
      const byCode = await tx.product.findFirst({
        where: { companyId: input.companyId, code: supplierCode, status: { not: 'ARCHIVED' } },
      });
      if (byCode) {
        await this.rememberSupplierCode(tx, input.companyId, input.partnerId, byCode.id, supplierCode);
        return byCode;
      }
    }

    if (description) {
      const byName = await tx.product.findFirst({
        where: { companyId: input.companyId, name: { equals: description, mode: 'insensitive' }, status: { not: 'ARCHIVED' } },
        orderBy: { createdAt: 'asc' },
      });
      if (byName) {
        await this.rememberSupplierCode(tx, input.companyId, input.partnerId, byName.id, supplierCode);
        return byName;
      }
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
    await this.rememberSupplierCode(tx, input.companyId, input.partnerId, created.id, supplierCode);
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
    try {
      await tx.supplierProductCode.create({
        data: { companyId, partnerId, productId, supplierCode },
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) throw error;
    }
  }
}
