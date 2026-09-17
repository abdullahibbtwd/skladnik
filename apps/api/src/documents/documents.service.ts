import { InjectQueue } from '@nestjs/bullmq';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Queue } from 'bullmq';
import { defaultStockDirection, type AuthUser } from '@skladnik/shared';
import { toNumber } from '../common/decimal';
import { OCR_JOB_EXTRACT, OCR_QUEUE, type OcrJobData } from '../extraction/ocr.constants';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { canDocumentBePosted } from './can-document-be-posted';
import { computeLineAmounts } from './document-pricing';
import {
  CreateDocumentDto,
  CreateDocumentLineDto,
  ListDocumentsQueryDto,
  UpdateDocumentDto,
  UpdateDocumentLineDto,
  lineQuantity,
} from './dto/document.dto';
import { assertCaptureUpload, isPdfUpload, pdfToPngPages } from './pdf-to-images';

const lineInclude = {
  product: {
    select: { id: true, name: true, code: true, unit: true, vatRate: true, batchTracking: true, status: true },
  },
  batch: { select: { id: true, batchNumber: true, expiryDate: true, quantityRemaining: true } },
} satisfies Prisma.DocumentLineInclude;

const documentInclude = {
  partner: { select: { id: true, name: true, kind: true, taxId: true } },
  site: { select: { id: true, name: true, type: true, isActive: true } },
  lines: { orderBy: { position: 'asc' as const }, include: lineInclude },
  captures: { orderBy: { pageNumber: 'asc' as const } },
} satisfies Prisma.DocumentInclude;

type DocumentRow = Prisma.DocumentGetPayload<{ include: typeof documentInclude }>;

const WRITABLE = new Set(['DRAFT', 'REVIEW']);

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    @InjectQueue(OCR_QUEUE) private readonly ocrQueue: Queue<OcrJobData>,
  ) {}

  async list(user: AuthUser, query: ListDocumentsQueryDto) {
    const siteIds = this.visibleSiteIds(user, query.siteId);
    const documents = await this.prisma.document.findMany({
      where: {
        companyId: user.companyId,
        ...(siteIds ? { siteId: { in: siteIds } } : {}),
        ...(query.status ? { status: query.status } : {}),
        ...(query.type ? { type: query.type } : {}),
      },
      include: {
        partner: { select: { id: true, name: true, kind: true, taxId: true } },
        site: { select: { id: true, name: true, type: true, isActive: true } },
        _count: { select: { lines: true, captures: true } },
      },
      orderBy: [{ issuedOn: 'desc' }, { createdAt: 'desc' }],
    });
    return {
      documents: documents.map((doc) => ({
        ...this.serializeHeader(doc),
        lineCount: doc._count.lines,
        captureCount: doc._count.captures,
      })),
    };
  }

  async get(user: AuthUser, id: string) {
    const document = await this.findInCompany(user, id);
    return this.serializeDetail(document);
  }

  async create(user: AuthUser, dto: CreateDocumentDto) {
    await this.assertSite(user, dto.siteId);
    if (dto.partnerId) await this.assertPartner(user.companyId, dto.partnerId);

    const direction = dto.direction ?? defaultStockDirection(dto.type);
    try {
      const document = await this.prisma.document.create({
        data: {
          companyId: user.companyId,
          siteId: dto.siteId,
          partnerId: dto.partnerId ?? null,
          type: dto.type,
          direction,
          status: 'DRAFT',
          number: dto.documentNumber.trim(),
          issuedOn: new Date(dto.issuedOn),
          deliveryAddress: dto.deliveryAddress?.trim() || null,
          notes: dto.notes?.trim() || null,
        },
        include: documentInclude,
      });
      await this.log(user, document.id, 'CREATE', { number: document.number, type: document.type });
      return this.serializeDetail(document);
    } catch (error) {
      this.throwIfNumberTaken(error);
      throw error;
    }
  }

  async update(user: AuthUser, id: string, dto: UpdateDocumentDto) {
    const existing = await this.findInCompany(user, id);
    this.assertWritable(existing.status);

    if (dto.siteId) await this.assertSite(user, dto.siteId);
    if (dto.partnerId) await this.assertPartner(user.companyId, dto.partnerId);

    const data: Prisma.DocumentUpdateInput = {};
    if (dto.type !== undefined) data.type = dto.type;
    if (dto.direction !== undefined) data.direction = dto.direction;
    else if (dto.type !== undefined && existing.direction === defaultStockDirection(existing.type)) {
      data.direction = defaultStockDirection(dto.type);
    }
    if (dto.documentNumber !== undefined) data.number = dto.documentNumber.trim();
    if (dto.issuedOn !== undefined) data.issuedOn = new Date(dto.issuedOn);
    if (dto.deliveryAddress !== undefined) data.deliveryAddress = dto.deliveryAddress?.trim() || null;
    if (dto.notes !== undefined) data.notes = dto.notes?.trim() || null;
    if (dto.siteId !== undefined) data.site = { connect: { id: dto.siteId } };
    if (dto.partnerId !== undefined) {
      data.partner = dto.partnerId ? { connect: { id: dto.partnerId } } : { disconnect: true };
    }

    try {
      const document = await this.prisma.document.update({
        where: { id: existing.id },
        data,
        include: documentInclude,
      });
      await this.log(user, document.id, 'UPDATE', { fields: Object.keys(dto) });
      return this.serializeDetail(document);
    } catch (error) {
      this.throwIfNumberTaken(error);
      throw error;
    }
  }

  async addLine(user: AuthUser, id: string, dto: CreateDocumentLineDto) {
    const existing = await this.findInCompany(user, id);
    this.assertWritable(existing.status);
    const product = await this.assertProduct(user.companyId, dto.productId);
    this.assertBatchFields(product, dto.batchNumber, dto.expiryDate);
    const quantity = this.requireQuantity(dto);

    const amounts = computeLineAmounts(quantity, dto.unitPrice, dto.discountPercent ?? 0);
    const position = existing.lines.length === 0 ? 0 : Math.max(...existing.lines.map((line) => line.position)) + 1;

    await this.prisma.documentLine.create({
      data: {
        companyId: user.companyId,
        documentId: existing.id,
        productId: product.id,
        position,
        quantity,
        unitPrice: dto.unitPrice,
        discountPercent: amounts.discountPercent,
        finalUnitPrice: amounts.finalUnitPrice,
        lineTotal: amounts.lineTotal,
        vatRate: dto.vatRate ?? toNumber(product.vatRate),
        unit: product.unit,
        ocrDescription: product.name,
        ocrBatchNumber: dto.batchNumber?.trim() || null,
        ocrExpiryDate: dto.expiryDate ? new Date(dto.expiryDate) : null,
      },
    });
    await this.log(user, existing.id, 'LINE_ADD', { productId: product.id, position });
    return this.get(user, existing.id);
  }

  async updateLine(user: AuthUser, id: string, lineId: string, dto: UpdateDocumentLineDto) {
    const existing = await this.findInCompany(user, id);
    this.assertWritable(existing.status);
    const line = existing.lines.find((row) => row.id === lineId);
    if (!line) throw new NotFoundException('Line not found');

    const productId = dto.productId ?? line.productId;
    const product = productId ? await this.assertProduct(user.companyId, productId) : null;
    const quantity =
      dto.quantity !== undefined || dto.qty !== undefined ? this.requireQuantity(dto) : toNumber(line.quantity);
    const unitPrice = dto.unitPrice ?? toNumber(line.unitPrice);
    const discountPercent = dto.discountPercent ?? toNumber(line.discountPercent);
    const batchNumber = dto.batchNumber !== undefined ? dto.batchNumber : line.ocrBatchNumber;
    const expiryDate = dto.expiryDate !== undefined ? dto.expiryDate : line.ocrExpiryDate?.toISOString().slice(0, 10);
    if (product) this.assertBatchFields(product, batchNumber, expiryDate);

    const amounts = computeLineAmounts(quantity, unitPrice, discountPercent);
    await this.prisma.documentLine.update({
      where: { id: line.id },
      data: {
        ...(product ? { productId: product.id, unit: product.unit, ocrDescription: product.name } : {}),
        quantity,
        unitPrice,
        discountPercent: amounts.discountPercent,
        finalUnitPrice: amounts.finalUnitPrice,
        lineTotal: amounts.lineTotal,
        ...(dto.vatRate !== undefined ? { vatRate: dto.vatRate } : {}),
        ...(dto.batchNumber !== undefined ? { ocrBatchNumber: dto.batchNumber?.trim() || null } : {}),
        ...(dto.expiryDate !== undefined ? { ocrExpiryDate: dto.expiryDate ? new Date(dto.expiryDate) : null } : {}),
      },
    });
    await this.log(user, existing.id, 'LINE_UPDATE', { lineId });
    return this.get(user, existing.id);
  }

  async removeLine(user: AuthUser, id: string, lineId: string) {
    const existing = await this.findInCompany(user, id);
    this.assertWritable(existing.status);
    const line = existing.lines.find((row) => row.id === lineId);
    if (!line) throw new NotFoundException('Line not found');
    await this.prisma.documentLine.delete({ where: { id: line.id } });
    await this.log(user, existing.id, 'LINE_DELETE', { lineId });
    return this.get(user, existing.id);
  }

  async submitForReview(user: AuthUser, id: string) {
    const existing = await this.findInCompany(user, id);
    if (existing.status !== 'DRAFT') {
      throw new BadRequestException('Only a draft can be submitted for review');
    }
    const document = await this.prisma.document.update({
      where: { id: existing.id },
      data: { status: 'REVIEW' },
      include: documentInclude,
    });
    await this.log(user, document.id, 'SUBMIT_REVIEW', { number: document.number });
    return this.serializeDetail(document);
  }

  async post(user: AuthUser, id: string) {
    const existing = await this.findInCompany(user, id);
    if (existing.status !== 'REVIEW') {
      throw new BadRequestException('Submit the document for review before posting');
    }
    const check = canDocumentBePosted(existing);
    if (!check.ok) {
      throw new BadRequestException(check.errors.join('. '));
    }

    const posted = await this.prisma.$transaction(async (tx) => {
      for (const line of existing.lines) {
        const product = line.product!;
        let batchId: string | null = null;
        if (product.batchTracking) {
          const batchNumber = line.ocrBatchNumber!.trim();
          const expiryDate = line.ocrExpiryDate!;
          const qty = toNumber(line.quantity);
          const delta = existing.direction === 'OUT' ? -qty : qty;
          const batch = await tx.batch.upsert({
            where: {
              companyId_productId_batchNumber: {
                companyId: user.companyId,
                productId: product.id,
                batchNumber,
              },
            },
            create: {
              companyId: user.companyId,
              productId: product.id,
              batchNumber,
              expiryDate,
              quantityRemaining: delta,
            },
            update: {
              quantityRemaining: { increment: delta },
            },
          });
          batchId = batch.id;
          await tx.documentLine.update({
            where: { id: line.id },
            data: { batchId: batch.id },
          });
        }

        await tx.stockMovement.create({
          data: {
            companyId: user.companyId,
            siteId: existing.siteId,
            documentId: existing.id,
            productId: product.id,
            batchId,
            direction: existing.direction,
            quantity: line.quantity,
            occurredAt: existing.issuedOn,
          },
        });
      }

      return tx.document.update({
        where: { id: existing.id },
        data: { status: 'POSTED', postedAt: new Date() },
        include: documentInclude,
      });
    });

    await this.log(user, posted.id, 'POST', { number: posted.number, lines: posted.lines.length });
    return this.serializeDetail(posted);
  }

  async cancel(user: AuthUser, id: string) {
    const existing = await this.findInCompany(user, id);
    if (existing.status === 'POSTED') {
      throw new BadRequestException('Posted documents cannot be cancelled — reverse with a new document');
    }
    if (existing.status === 'CANCELLED') {
      return this.serializeDetail(existing);
    }
    const document = await this.prisma.document.update({
      where: { id: existing.id },
      data: { status: 'CANCELLED' },
      include: documentInclude,
    });
    await this.log(user, document.id, 'CANCEL', { number: document.number });
    return this.serializeDetail(document);
  }

  async addCapture(user: AuthUser, id: string, file: Express.Multer.File) {
    const existing = await this.findInCompany(user, id);
    this.assertWritable(existing.status);
    assertCaptureUpload(file);
    const pages = isPdfUpload(file) ? await pdfToPngPages(file) : [file];
    let nextPage = existing.captures.length === 0 ? 1 : Math.max(...existing.captures.map((row) => row.pageNumber)) + 1;
    const captureIds: string[] = [];

    for (const page of pages) {
      const uploaded = await this.storage.upload(page, `documents/${user.companyId}/${existing.id}`);
      const capture = await this.prisma.documentCapture.create({
        data: {
          companyId: user.companyId,
          documentId: existing.id,
          pageNumber: nextPage,
          imageKey: uploaded.key,
          extractionStatus: 'QUEUED',
        },
      });
      captureIds.push(capture.id);
      nextPage += 1;
    }

    for (const captureId of captureIds) {
      await this.enqueueExtraction(captureId, existing.id, user.companyId);
    }
    await this.log(user, existing.id, 'CAPTURE_ADD', {
      pages: captureIds.length,
      source: isPdfUpload(file) ? 'pdf' : 'image',
    });
    return this.get(user, existing.id);
  }

  async retryExtraction(user: AuthUser, id: string, captureId: string) {
    const existing = await this.findInCompany(user, id);
    this.assertWritable(existing.status);
    const capture = existing.captures.find((row) => row.id === captureId);
    if (!capture) throw new NotFoundException('Capture not found');
    await this.prisma.documentCapture.update({
      where: { id: capture.id },
      data: { extractionStatus: 'QUEUED', extractionError: null },
    });
    await this.enqueueExtraction(capture.id, existing.id, user.companyId);
    await this.log(user, existing.id, 'CAPTURE_RETRY_OCR', { captureId: capture.id });
    return this.get(user, existing.id);
  }

  async captureUrl(user: AuthUser, id: string, captureId: string) {
    const existing = await this.findInCompany(user, id);
    const capture = existing.captures.find((row) => row.id === captureId);
    if (!capture) throw new NotFoundException('Capture not found');
    return {
      id: capture.id,
      pageNumber: capture.pageNumber,
      signedUrl: await this.storage.signedUrl(capture.imageKey),
    };
  }

  async captureFile(user: AuthUser, id: string, captureId: string) {
    const existing = await this.findInCompany(user, id);
    const capture = existing.captures.find((row) => row.id === captureId);
    if (!capture) throw new NotFoundException('Capture not found');
    const object = await this.storage.getObject(capture.imageKey);
    if (!object.body) throw new NotFoundException('Image missing');
    return {
      body: object.body,
      contentType: object.contentType ?? 'image/jpeg',
      pageNumber: capture.pageNumber,
    };
  }

  private async findInCompany(user: AuthUser, id: string) {
    const document = await this.prisma.document.findFirst({
      where: { id, companyId: user.companyId },
      include: documentInclude,
    });
    if (!document) throw new NotFoundException('Document not found');
    if (!user.allSites && !user.siteIds.includes(document.siteId)) {
      throw new ForbiddenException('Document is outside your assigned locations');
    }
    return document;
  }

  private async enqueueExtraction(captureId: string, documentId: string, companyId: string) {
    try {
      await this.ocrQueue.add(
        OCR_JOB_EXTRACT,
        { captureId, documentId, companyId },
        { attempts: 2, backoff: { type: 'exponential', delay: 4000 }, removeOnComplete: 100, removeOnFail: 100 },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not enqueue OCR job';
      await this.prisma.documentCapture.update({
        where: { id: captureId },
        data: { extractionStatus: 'FAILED', extractionError: message },
      });
    }
  }

  private visibleSiteIds(user: AuthUser, requested?: string) {
    if (user.allSites) return requested ? [requested] : undefined;
    const allowed = user.siteIds;
    if (requested) {
      if (!allowed.includes(requested)) throw new ForbiddenException('Site is outside your assigned locations');
      return [requested];
    }
    return allowed.length ? allowed : ['00000000-0000-0000-0000-000000000000'];
  }

  private async assertSite(user: AuthUser, siteId: string) {
    const site = await this.prisma.site.findFirst({
      where: { id: siteId, companyId: user.companyId },
      select: { id: true, isActive: true },
    });
    if (!site) throw new NotFoundException('Site not found');
    if (!user.allSites && !user.siteIds.includes(site.id)) {
      throw new ForbiddenException('Site is outside your assigned locations');
    }
  }

  private async assertPartner(companyId: string, partnerId: string) {
    const partner = await this.prisma.partner.findFirst({ where: { id: partnerId, companyId }, select: { id: true } });
    if (!partner) throw new NotFoundException('Partner not found');
  }

  private async assertProduct(companyId: string, productId: string) {
    const product = await this.prisma.product.findFirst({ where: { id: productId, companyId } });
    if (!product) throw new NotFoundException('Product not found');
    if (product.status === 'ARCHIVED') throw new BadRequestException('Product is archived');
    return product;
  }

  private assertWritable(status: string) {
    if (!WRITABLE.has(status)) {
      throw new BadRequestException('Posted or cancelled documents cannot be edited');
    }
  }

  private requireQuantity(dto: { quantity?: number; qty?: number }) {
    try {
      const quantity = lineQuantity(dto);
      if (quantity < 0.001) throw new BadRequestException('quantity must be greater than 0');
      return quantity;
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException('quantity is required');
    }
  }

  private assertBatchFields(
    product: { name: string; batchTracking: boolean },
    batchNumber?: string | null,
    expiryDate?: string | null,
  ) {
    if (!product.batchTracking) return;
    if (!batchNumber?.trim() || !expiryDate) {
      throw new BadRequestException(`Batch number and expiry date are required for ${product.name}`);
    }
  }

  private throwIfNumberTaken(error: unknown): never | void {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictException('A document with this number already exists');
    }
  }

  private serializeHeader(doc: {
    id: string;
    type: DocumentRow['type'];
    status: DocumentRow['status'];
    direction: DocumentRow['direction'];
    number: string;
    issuedOn: Date;
    deliveryAddress: string | null;
    notes: string | null;
    postedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    partner: DocumentRow['partner'];
    site: DocumentRow['site'];
  }) {
    return {
      id: doc.id,
      type: doc.type,
      status: doc.status,
      direction: doc.direction,
      documentNumber: doc.number,
      issuedOn: doc.issuedOn.toISOString().slice(0, 10),
      deliveryAddress: doc.deliveryAddress,
      notes: doc.notes,
      postedAt: doc.postedAt,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
      partner: doc.partner,
      site: doc.site,
    };
  }

  private serializeDetail(doc: DocumentRow) {
    const posting = canDocumentBePosted(doc);
    const captures = doc.captures.map((capture) => ({
      id: capture.id,
      pageNumber: capture.pageNumber,
      imageKey: capture.imageKey,
      createdAt: capture.createdAt,
      extractionStatus: capture.extractionStatus,
      extractionFailed: capture.extractionStatus === 'FAILED',
      extractionError: capture.extractionError,
      confidence: capture.confidence,
    }));
    const succeeded = captures.filter((row) => row.extractionStatus === 'SUCCEEDED' && row.confidence);
    const confidence =
      succeeded.find((row) => row.confidence === 'low')?.confidence ??
      succeeded.find((row) => row.confidence === 'medium')?.confidence ??
      succeeded[0]?.confidence ??
      null;
    return {
      document: {
        ...this.serializeHeader(doc),
        extraction: {
          confidence,
          reading: captures.some((row) => row.extractionStatus === 'QUEUED' || row.extractionStatus === 'RUNNING'),
        },
        lines: doc.lines.map((line) => ({
          id: line.id,
          position: line.position,
          productId: line.productId,
          product: line.product,
          quantity: toNumber(line.quantity),
          unitPrice: toNumber(line.unitPrice),
          discountPercent: toNumber(line.discountPercent),
          finalUnitPrice: line.finalUnitPrice === null ? null : toNumber(line.finalUnitPrice),
          lineTotal: line.lineTotal === null ? null : toNumber(line.lineTotal),
          vatRate: toNumber(line.vatRate),
          unit: line.unit,
          batchNumber: line.ocrBatchNumber,
          expiryDate: line.ocrExpiryDate ? line.ocrExpiryDate.toISOString().slice(0, 10) : null,
          batch: line.batch
            ? {
                id: line.batch.id,
                batchNumber: line.batch.batchNumber,
                expiryDate: line.batch.expiryDate?.toISOString().slice(0, 10) ?? null,
                quantityRemaining: toNumber(line.batch.quantityRemaining),
              }
            : null,
          verified: line.verified,
        })),
        captures,
      },
      posting,
    };
  }

  private async log(user: AuthUser, entityId: string, action: string, metadata: Prisma.InputJsonValue) {
    await this.prisma.activityLog.create({
      data: {
        companyId: user.companyId,
        userId: user.id,
        entityType: 'Document',
        entityId,
        action,
        metadata,
      },
    });
  }
}
