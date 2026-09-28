import { randomUUID } from 'node:crypto';
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
import {
  defaultStockDirection,
  isPaperDocumentType,
  isStockOperationType,
  isTillDocumentType,
  type AuthUser,
  type StockDirection,
} from '@skladnik/shared';
import { toNumber } from '../common/decimal';
import { OCR_JOB_EXTRACT, OCR_JOB_OPTIONS, OCR_QUEUE, ocrJobId, type OcrJobData } from '../extraction/ocr.constants';
import { PrismaService } from '../prisma/prisma.service';
import { loadCostBook, lockSites, saveAverages, siteLedger } from '../stock/ledger';
import { StorageService } from '../storage/storage.service';
import { canDocumentBePosted, expiredBatchWarnings, expiryGuarded } from './can-document-be-posted';
import { onHandByKey, stockShortfalls } from './stock-availability';
import { computeLineAmounts } from './document-pricing';
import {
  CreateDocumentDto,
  CreateDocumentLineDto,
  ListDocumentsQueryDto,
  ScanDocumentDto,
  StocktakeCountDto,
  UpdateDocumentDto,
  UpdateDocumentLineDto,
  lineQuantity,
} from './dto/document.dto';
import { assertCaptureUpload, isPdfUpload, pdfToPngPages } from './pdf-to-images';

const lineInclude = {
  product: {
    select: { id: true, name: true, code: true, unit: true, vatRate: true, batchTracking: true, status: true },
  },
  batch: { select: { id: true, batchNumber: true, expiryDate: true } },
} satisfies Prisma.DocumentLineInclude;

const siteSelect = { select: { id: true, name: true, type: true, isActive: true } } as const;

const documentInclude = {
  partner: { select: { id: true, name: true, kind: true, taxId: true } },
  site: siteSelect,
  targetSite: siteSelect,
  lines: { orderBy: { position: 'asc' as const }, include: lineInclude },
  captures: { orderBy: { pageNumber: 'asc' as const } },
} satisfies Prisma.DocumentInclude;

type DocumentRow = Prisma.DocumentGetPayload<{ include: typeof documentInclude }>;
type LineRow = DocumentRow['lines'][number];

type StocktakeLinePreview = { expected: number; unitCost: number };

const WRITABLE = new Set(['DRAFT', 'REVIEW']);

const round3 = (value: number) => Math.round(value * 1000) / 1000;
const round4 = (value: number) => Math.round(value * 10000) / 10000;
const isoDate = (value: Date) => value.toISOString().slice(0, 10);

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
        ...(siteIds ? { OR: [{ siteId: { in: siteIds } }, { targetSiteId: { in: siteIds } }] } : {}),
        ...(query.status ? { status: query.status } : {}),
        // Till sales have their own screens and would bury the paperwork here.
        type: query.type ?? { not: 'SALE' },
      },
      include: {
        partner: { select: { id: true, name: true, kind: true, taxId: true } },
        site: siteSelect,
        targetSite: siteSelect,
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
    return this.detail(document);
  }

  async create(user: AuthUser, dto: CreateDocumentDto) {
    if (isTillDocumentType(dto.type)) throw new BadRequestException('Sales are recorded at the till');
    await this.assertSite(user, dto.siteId);
    if (dto.partnerId) await this.assertPartner(user.companyId, dto.partnerId);
    if (dto.targetSiteId) {
      if (dto.type !== 'TRANSFER') throw new BadRequestException('Only a transfer has a receiving site');
      await this.assertTargetSite(user.companyId, dto.targetSiteId, dto.siteId);
    }

    const direction = isStockOperationType(dto.type)
      ? defaultStockDirection(dto.type)
      : (dto.direction ?? defaultStockDirection(dto.type));
    if (dto.writeOffReason) this.assertWriteOffShape(dto.type, direction);
    try {
      const document = await this.prisma.document.create({
        data: {
          companyId: user.companyId,
          siteId: dto.siteId,
          targetSiteId: dto.targetSiteId ?? null,
          partnerId: dto.partnerId ?? null,
          type: dto.type,
          direction,
          status: 'DRAFT',
          number: dto.documentNumber.trim(),
          issuedOn: new Date(dto.issuedOn),
          deliveryAddress: dto.deliveryAddress?.trim() || null,
          notes: dto.notes?.trim() || null,
          writeOffReason: dto.writeOffReason ?? null,
        },
        include: documentInclude,
      });
      await this.log(user, document.id, 'CREATE', {
        number: document.number,
        type: document.type,
        ...(document.writeOffReason ? { writeOffReason: document.writeOffReason } : {}),
        ...(document.targetSiteId ? { targetSiteId: document.targetSiteId } : {}),
      });
      return this.detail(document);
    } catch (error) {
      this.throwIfNumberTaken(error);
      throw error;
    }
  }

  async update(user: AuthUser, id: string, dto: UpdateDocumentDto) {
    const existing = await this.findInCompany(user, id, true);
    this.assertWritable(existing.status);

    if (dto.type !== undefined && isTillDocumentType(dto.type)) {
      throw new BadRequestException('Sales are recorded at the till');
    }
    if (
      dto.type !== undefined &&
      dto.type !== existing.type &&
      (isStockOperationType(dto.type) || isStockOperationType(existing.type))
    ) {
      throw new BadRequestException("The type of a transfer, stocktake or opening stock document can't be changed");
    }
    const stockOperation = isStockOperationType(existing.type);
    if (dto.siteId) await this.assertSite(user, dto.siteId);
    if (dto.partnerId) await this.assertPartner(user.companyId, dto.partnerId);
    if (dto.targetSiteId) {
      if (existing.type !== 'TRANSFER') throw new BadRequestException('Only a transfer has a receiving site');
      await this.assertTargetSite(user.companyId, dto.targetSiteId, dto.siteId ?? existing.siteId);
    }

    const data: Prisma.DocumentUpdateInput = {};
    if (dto.type !== undefined) data.type = dto.type;
    if (!stockOperation) {
      if (dto.direction !== undefined) data.direction = dto.direction;
      else if (dto.type !== undefined && existing.direction === defaultStockDirection(existing.type)) {
        data.direction = defaultStockDirection(dto.type);
      }
    }
    if (dto.documentNumber !== undefined) data.number = dto.documentNumber.trim();
    if (dto.issuedOn !== undefined) data.issuedOn = new Date(dto.issuedOn);
    if (dto.deliveryAddress !== undefined) data.deliveryAddress = dto.deliveryAddress?.trim() || null;
    if (dto.notes !== undefined) data.notes = dto.notes?.trim() || null;
    if (dto.siteId !== undefined) data.site = { connect: { id: dto.siteId } };
    if (dto.partnerId !== undefined) {
      data.partner = dto.partnerId ? { connect: { id: dto.partnerId } } : { disconnect: true };
    }
    if (dto.targetSiteId !== undefined) {
      data.targetSite = dto.targetSiteId ? { connect: { id: dto.targetSiteId } } : { disconnect: true };
    }
    const nextType = dto.type ?? existing.type;
    const nextDirection = (data.direction as StockDirection | undefined) ?? existing.direction;
    let nextReason = dto.writeOffReason !== undefined ? dto.writeOffReason : existing.writeOffReason;
    if (dto.writeOffReason === undefined && nextType !== 'PROTOCOL') nextReason = null;
    if (nextReason) this.assertWriteOffShape(nextType, nextDirection);
    if (nextReason !== existing.writeOffReason) data.writeOffReason = nextReason;

    try {
      const document = await this.prisma.document.update({
        where: { id: existing.id },
        data,
        include: documentInclude,
      });
      await this.log(user, document.id, 'UPDATE', { fields: Object.keys(dto) });
      return this.detail(document);
    } catch (error) {
      this.throwIfNumberTaken(error);
      throw error;
    }
  }

  async addLine(user: AuthUser, id: string, dto: CreateDocumentLineDto) {
    const existing = await this.findInCompany(user, id, true);
    this.assertWritable(existing.status);
    const product = await this.assertProduct(user.companyId, dto.productId);
    this.assertBatchFields(product, dto.batchNumber, dto.expiryDate);
    const position = existing.lines.length === 0 ? 0 : Math.max(...existing.lines.map((line) => line.position)) + 1;

    if (existing.type === 'STOCKTAKE') {
      const batchNumber = product.batchTracking ? (dto.batchNumber?.trim() ?? '') : '';
      const duplicate = existing.lines.find(
        (line) =>
          line.productId === product.id &&
          (!product.batchTracking || (line.ocrBatchNumber?.trim() ?? '') === batchNumber),
      );
      if (duplicate) {
        throw new ConflictException(`${product.name} is already on the count sheet (line ${duplicate.position + 1})`);
      }
      await this.prisma.documentLine.create({
        data: {
          companyId: user.companyId,
          documentId: existing.id,
          productId: product.id,
          position,
          quantity: 0,
          unitPrice: 0,
          vatRate: toNumber(product.vatRate),
          unit: product.unit,
          ocrDescription: product.name,
          ocrBatchNumber: product.batchTracking ? batchNumber : null,
          ocrExpiryDate: product.batchTracking && dto.expiryDate ? new Date(dto.expiryDate) : null,
          countedQuantity: dto.countedQuantity ?? null,
        },
      });
      await this.log(user, existing.id, 'LINE_ADD', { productId: product.id, position });
      return this.get(user, existing.id);
    }

    const quantity = this.requireQuantity(dto);
    const amounts = computeLineAmounts(quantity, dto.unitPrice, dto.discountPercent ?? 0);
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
    const existing = await this.findInCompany(user, id, true);
    this.assertWritable(existing.status);
    const line = existing.lines.find((row) => row.id === lineId);
    if (!line) throw new NotFoundException('Line not found');

    if (existing.type === 'STOCKTAKE') {
      if (dto.productId !== undefined && dto.productId !== line.productId) {
        throw new BadRequestException('Remove the line and add the other product instead');
      }
      const batchNumber = dto.batchNumber !== undefined ? dto.batchNumber : line.ocrBatchNumber;
      const expiryDate = dto.expiryDate !== undefined ? dto.expiryDate : line.ocrExpiryDate && isoDate(line.ocrExpiryDate);
      if (line.product) this.assertBatchFields(line.product, batchNumber, expiryDate);
      await this.prisma.documentLine.update({
        where: { id: line.id },
        data: {
          ...(dto.countedQuantity !== undefined ? { countedQuantity: dto.countedQuantity } : {}),
          ...(dto.batchNumber !== undefined ? { ocrBatchNumber: dto.batchNumber?.trim() || null } : {}),
          ...(dto.expiryDate !== undefined ? { ocrExpiryDate: dto.expiryDate ? new Date(dto.expiryDate) : null } : {}),
        },
      });
      await this.log(user, existing.id, 'LINE_UPDATE', { lineId });
      return this.get(user, existing.id);
    }

    const productId = dto.productId ?? line.productId;
    const product = productId ? await this.assertProduct(user.companyId, productId) : null;
    const productChanged = Boolean(product && product.id !== line.productId);
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
        // ocrDescription is what the supplier printed; keep it so review can compare against the photo.
        ...(productChanged && product ? { productId: product.id, unit: product.unit } : {}),
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
    const existing = await this.findInCompany(user, id, true);
    this.assertWritable(existing.status);
    const line = existing.lines.find((row) => row.id === lineId);
    if (!line) throw new NotFoundException('Line not found');
    await this.prisma.documentLine.delete({ where: { id: line.id } });
    await this.log(user, existing.id, 'LINE_DELETE', { lineId });
    return this.get(user, existing.id);
  }

  /** Puts every product and batch with stock at the site on the count sheet (skipping ones already there). */
  async fillStocktake(user: AuthUser, id: string) {
    const existing = await this.findInCompany(user, id, true);
    this.assertWritable(existing.status);
    if (existing.type !== 'STOCKTAKE') throw new BadRequestException('Only a stocktake has a count sheet');

    const rows = (await siteLedger(this.prisma, user.companyId, existing.siteId)).filter((row) => row.onHand !== 0);
    const productIds = [...new Set(rows.map((row) => row.productId))];
    const batchIds = rows.map((row) => row.batchId).filter((batchId): batchId is string => Boolean(batchId));
    const [products, batches] = await Promise.all([
      this.prisma.product.findMany({
        where: { companyId: user.companyId, id: { in: productIds }, status: { not: 'ARCHIVED' } },
        select: { id: true, name: true, unit: true, vatRate: true, batchTracking: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.batch.findMany({
        where: { companyId: user.companyId, id: { in: batchIds } },
        select: { id: true, batchNumber: true, expiryDate: true },
      }),
    ]);
    const batchById = new Map(batches.map((batch) => [batch.id, batch]));
    const onSheet = new Set(
      existing.lines.map((line) => `${line.productId}\u0000${line.product?.batchTracking ? (line.ocrBatchNumber?.trim() ?? '') : ''}`),
    );

    let position = existing.lines.length === 0 ? 0 : Math.max(...existing.lines.map((line) => line.position)) + 1;
    const data: Prisma.DocumentLineCreateManyInput[] = [];
    for (const product of products) {
      const productRows = rows.filter((row) => row.productId === product.id);
      const entries = product.batchTracking
        ? productRows
            .filter((row) => row.batchId && batchById.has(row.batchId))
            .map((row) => batchById.get(row.batchId!)!)
            .sort((a, b) => (a.expiryDate?.getTime() ?? Infinity) - (b.expiryDate?.getTime() ?? Infinity))
        : [null];
      for (const batch of entries) {
        const key = `${product.id}\u0000${batch?.batchNumber ?? ''}`;
        if (onSheet.has(key)) continue;
        onSheet.add(key);
        data.push({
          companyId: user.companyId,
          documentId: existing.id,
          productId: product.id,
          position: position++,
          quantity: 0,
          unitPrice: 0,
          vatRate: product.vatRate,
          unit: product.unit,
          ocrDescription: product.name,
          ocrBatchNumber: batch?.batchNumber ?? null,
          ocrExpiryDate: batch?.expiryDate ?? null,
        });
      }
    }
    if (data.length) await this.prisma.documentLine.createMany({ data });
    await this.log(user, existing.id, 'STOCKTAKE_FILL', { lines: data.length });
    return this.get(user, existing.id);
  }

  async setCounts(user: AuthUser, id: string, counts: StocktakeCountDto[]) {
    const existing = await this.findInCompany(user, id, true);
    this.assertWritable(existing.status);
    if (existing.type !== 'STOCKTAKE') throw new BadRequestException('Only a stocktake has a count sheet');
    const lineIds = new Set(existing.lines.map((line) => line.id));
    const unknown = counts.find((count) => !lineIds.has(count.lineId));
    if (unknown) throw new NotFoundException('Line not found');

    await this.prisma.$transaction(
      counts.map((count) =>
        this.prisma.documentLine.update({
          where: { id: count.lineId },
          data: { countedQuantity: count.countedQuantity ?? null },
        }),
      ),
    );
    await this.log(user, existing.id, 'STOCKTAKE_COUNT', { lines: counts.length });
    return this.get(user, existing.id);
  }

  async submitForReview(user: AuthUser, id: string) {
    const existing = await this.findInCompany(user, id, true);
    if (existing.status !== 'DRAFT') {
      throw new BadRequestException('Only a draft can be submitted for review');
    }
    const document = await this.prisma.document.update({
      where: { id: existing.id },
      data: { status: 'REVIEW' },
      include: documentInclude,
    });
    await this.log(user, document.id, 'SUBMIT_REVIEW', { number: document.number });
    return this.detail(document);
  }

  async post(user: AuthUser, id: string, options: { confirmExpired?: boolean } = {}) {
    const existing = await this.findInCompany(user, id, true);
    if (existing.status !== 'REVIEW') {
      throw new BadRequestException('Submit the document for review before posting');
    }
    const check = canDocumentBePosted(existing);
    if (!check.ok) {
      throw new BadRequestException(check.errors.join('. '));
    }
    if (existing.type === 'TRANSFER') {
      await this.assertTargetSite(user.companyId, existing.targetSiteId!, existing.siteId);
    }
    const expired = await this.expiryWarnings(existing);
    if (expired.length && !options.confirmExpired) {
      throw new BadRequestException(`${expired.join('. ')}. Confirm to hand over expired stock.`);
    }

    const posted = await this.prisma.$transaction(
      async (tx) => {
        // Conditional flip first: it row-locks the document, so a double tap can't write the ledger twice.
        const flipped = await tx.document.updateMany({
          where: { id: existing.id, status: 'REVIEW' },
          data: { status: 'POSTED', postedAt: new Date() },
        });
        if (flipped.count !== 1) throw new ConflictException('This document was already posted');

        // Costs and availability are read then written, so postings at a site run one at a time.
        await lockSites(tx, existing.targetSiteId ? [existing.siteId, existing.targetSiteId] : [existing.siteId]);

        if (existing.type === 'STOCKTAKE') {
          await this.writeStocktake(tx, existing);
        } else {
          if (existing.direction === 'OUT') {
            const shortfalls = await this.outShortfalls(tx, existing);
            if (shortfalls.length) throw new BadRequestException(shortfalls.join('. '));
          }
          await this.writeMovements(tx, existing);
        }

        return tx.document.findUniqueOrThrow({ where: { id: existing.id }, include: documentInclude });
      },
      { timeout: 30_000 },
    );

    await this.log(user, posted.id, 'POST', {
      number: posted.number,
      lines: posted.lines.length,
      ...(expired.length ? { confirmedExpired: expired } : {}),
    });
    return this.detail(posted);
  }

  async cancel(user: AuthUser, id: string) {
    const existing = await this.findInCompany(user, id, true);
    if (existing.status === 'POSTED') {
      throw new BadRequestException('Posted documents cannot be cancelled — reverse with a new document');
    }
    if (existing.status === 'CANCELLED') {
      return this.detail(existing);
    }
    const document = await this.prisma.document.update({
      where: { id: existing.id },
      data: { status: 'CANCELLED' },
      include: documentInclude,
    });
    await this.log(user, document.id, 'CANCEL', { number: document.number });
    return this.detail(document);
  }

  async addCapture(user: AuthUser, id: string, file: Express.Multer.File) {
    const existing = await this.findInCompany(user, id, true);
    this.assertWritable(existing.status);
    assertCaptureUpload(file);
    let nextPage = existing.captures.length === 0 ? 1 : Math.max(...existing.captures.map((row) => row.pageNumber)) + 1;
    const captureIds: string[] = [];
    const evidenceOnly = existing.writeOffReason !== null || !isPaperDocumentType(existing.type);
    const stored = await this.storePages(user.companyId, existing.id, file);

    for (const imageKey of stored.imageKeys) {
      const capture = await this.prisma.documentCapture.create({
        data: {
          companyId: user.companyId,
          documentId: existing.id,
          pageNumber: nextPage,
          imageKey,
          sourceKey: stored.sourceKey,
          extractionStatus: evidenceOnly ? 'IDLE' : 'QUEUED',
        },
      });
      captureIds.push(capture.id);
      nextPage += 1;
    }

    if (!evidenceOnly) {
      for (const captureId of captureIds) {
        await this.enqueueExtraction(captureId, existing.id, user.companyId);
      }
    }
    await this.log(user, existing.id, 'CAPTURE_ADD', {
      pages: captureIds.length,
      source: stored.pdf ? 'pdf' : 'image',
      ...(evidenceOnly ? { evidence: true } : {}),
    });
    return this.get(user, existing.id);
  }

  /**
   * Scan: the document and its photo in one request, so a phone that loses the connection halfway
   * never leaves an empty draft. The offline queue retries with the same clientRequestId, which
   * returns the document already created instead of a second one.
   */
  async createFromScan(user: AuthUser, dto: ScanDocumentDto, file: Express.Multer.File) {
    const replay = await this.findByClientRequest(user, dto.clientRequestId);
    if (replay) return this.detail(replay);

    const site = await this.prisma.site.findFirst({
      where: { id: dto.siteId, companyId: user.companyId },
      select: { id: true, name: true, isActive: true },
    });
    if (!site) throw new NotFoundException('Site not found');
    if (!user.allSites && !user.siteIds.includes(site.id)) {
      throw new ForbiddenException('Site is outside your assigned locations');
    }
    if (!site.isActive) throw new BadRequestException(`${site.name} is deactivated; choose another site and scan again`);
    assertCaptureUpload(file);

    const documentId = randomUUID();
    const stored = await this.storePages(user.companyId, documentId, file);
    let document: DocumentRow;
    try {
      document = await this.prisma.document.create({
        data: {
          id: documentId,
          companyId: user.companyId,
          siteId: site.id,
          type: dto.type,
          direction: defaultStockDirection(dto.type),
          status: 'DRAFT',
          number: `SCAN-${documentId.slice(0, 8).toUpperCase()}`,
          issuedOn: new Date(dto.issuedOn),
          createdById: user.id,
          clientRequestId: dto.clientRequestId,
          captures: {
            create: stored.imageKeys.map((imageKey, index) => ({
              companyId: user.companyId,
              pageNumber: index + 1,
              imageKey,
              sourceKey: stored.sourceKey,
              extractionStatus: 'QUEUED' as const,
            })),
          },
        },
        include: documentInclude,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const concurrent = await this.findByClientRequest(user, dto.clientRequestId);
        if (concurrent) return this.detail(concurrent);
      }
      this.throwIfNumberTaken(error);
      throw error;
    }

    for (const capture of document.captures) {
      await this.enqueueExtraction(capture.id, document.id, user.companyId);
    }
    await this.log(user, document.id, 'CREATE', {
      number: document.number,
      type: document.type,
      source: 'scan',
      ...(dto.capturedAt ? { capturedAt: dto.capturedAt } : {}),
    });
    await this.log(user, document.id, 'CAPTURE_ADD', { pages: document.captures.length, source: stored.pdf ? 'pdf' : 'image' });
    return this.detail(document);
  }

  async retryExtraction(user: AuthUser, id: string, captureId: string) {
    const existing = await this.findInCompany(user, id, true);
    this.assertWritable(existing.status);
    const capture = existing.captures.find((row) => row.id === captureId);
    if (!capture) throw new NotFoundException('Capture not found');
    if (existing.writeOffReason || !isPaperDocumentType(existing.type)) {
      throw new BadRequestException('Photos on this document are evidence and are not read');
    }
    if (capture.extractionStatus === 'QUEUED' || capture.extractionStatus === 'RUNNING') {
      return this.get(user, existing.id);
    }
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

  /** Pages are read from PNGs; an uploaded PDF is also kept whole for the accountant's archive. */
  private async storePages(companyId: string, documentId: string, file: Express.Multer.File) {
    const pdf = isPdfUpload(file);
    const pages = pdf ? await pdfToPngPages(file) : [file];
    const prefix = `documents/${companyId}/${documentId}`;
    const sourceKey = pdf ? (await this.storage.upload(file, prefix)).key : null;
    const imageKeys: string[] = [];
    for (const page of pages) imageKeys.push((await this.storage.upload(page, prefix)).key);
    return { pdf, sourceKey, imageKeys };
  }

  private async findByClientRequest(user: AuthUser, clientRequestId: string) {
    const document = await this.prisma.document.findUnique({
      where: { companyId_clientRequestId: { companyId: user.companyId, clientRequestId } },
      include: documentInclude,
    });
    if (!document) return null;
    if (isTillDocumentType(document.type)) throw new ConflictException('This request key belongs to a sale');
    return this.findInCompany(user, document.id);
  }

  /** Receiving-site users can read a transfer; only the sending site can change or post it. */
  private async findInCompany(user: AuthUser, id: string, write = false) {
    const document = await this.prisma.document.findFirst({
      where: { id, companyId: user.companyId },
      include: documentInclude,
    });
    if (!document) throw new NotFoundException('Document not found');
    if (write && isTillDocumentType(document.type)) {
      throw new BadRequestException('A sale is changed only by voiding it at the till');
    }
    if (user.allSites) return document;
    const sending = user.siteIds.includes(document.siteId);
    const receiving = Boolean(document.targetSiteId && user.siteIds.includes(document.targetSiteId));
    if (!sending && !receiving) {
      throw new ForbiddenException('Document is outside your assigned locations');
    }
    if (write && !sending) {
      throw new ForbiddenException('Only the sending site can change this transfer');
    }
    return document;
  }

  private async resolveBatch(tx: Prisma.TransactionClient, companyId: string, line: LineRow) {
    if (!line.product!.batchTracking) return null;
    const batchNumber = line.ocrBatchNumber!.trim();
    const batch = await tx.batch.upsert({
      where: { companyId_productId_batchNumber: { companyId, productId: line.productId!, batchNumber } },
      create: { companyId, productId: line.productId!, batchNumber, expiryDate: line.ocrExpiryDate! },
      update: {},
    });
    return batch.id;
  }

  /**
   * One movement per line, each with a unit cost. IN costs the price on the line; OUT costs the
   * batch cost or the site's moving average. A transfer writes OUT at the sender and the same cost IN
   * at the receiver. Internal documents (transfers, write-offs) have their line prices set to cost.
   */
  private async writeMovements(tx: Prisma.TransactionClient, doc: DocumentRow) {
    const productIds = [...new Set(doc.lines.map((line) => line.productId!))];
    const source = await loadCostBook(tx, doc.companyId, doc.siteId, productIds);
    const target = doc.type === 'TRANSFER' ? await loadCostBook(tx, doc.companyId, doc.targetSiteId!, productIds) : null;
    const internal = doc.type === 'TRANSFER' || doc.writeOffReason !== null;

    for (const line of doc.lines) {
      const productId = line.productId!;
      const batchId = await this.resolveBatch(tx, doc.companyId, line);
      const quantity = toNumber(line.quantity);
      let unitCost: number;
      if (doc.direction === 'IN') {
        unitCost = toNumber(line.finalUnitPrice ?? line.unitPrice);
        source.book.receive(productId, batchId, quantity, unitCost);
      } else {
        unitCost = source.book.issue(productId, batchId, quantity);
      }
      const movement = {
        companyId: doc.companyId,
        documentId: doc.id,
        documentLineId: line.id,
        productId,
        batchId,
        quantity: line.quantity,
        unitCost,
        occurredAt: doc.issuedOn,
      };
      await tx.stockMovement.create({ data: { ...movement, siteId: doc.siteId, direction: doc.direction } });
      if (target) {
        target.book.receive(productId, batchId, quantity, unitCost);
        await tx.stockMovement.create({ data: { ...movement, siteId: doc.targetSiteId!, direction: 'IN' } });
      }
      await tx.documentLine.update({
        where: { id: line.id },
        data: {
          batchId,
          ...(internal
            ? { unitPrice: unitCost, discountPercent: 0, finalUnitPrice: unitCost, lineTotal: round4(unitCost * quantity) }
            : {}),
        },
      });
    }

    await saveAverages(tx, doc.companyId, doc.siteId, source.book);
    if (target) await saveAverages(tx, doc.companyId, doc.targetSiteId!, target.book);
  }

  /**
   * Variance protocol: for every counted line, book quantity is read now (under the site lock) and frozen
   * on the line; the difference is written as an IN (surplus) or OUT (shortage) at the current cost.
   * Uncounted lines are left alone.
   */
  private async writeStocktake(tx: Prisma.TransactionClient, doc: DocumentRow) {
    const counted = doc.lines.filter((line) => line.countedQuantity !== null);
    const productIds = [...new Set(counted.map((line) => line.productId!))];
    const { book } = await loadCostBook(tx, doc.companyId, doc.siteId, productIds);

    for (const line of counted) {
      const productId = line.productId!;
      const batchId = await this.resolveBatch(tx, doc.companyId, line);
      const expected = line.product!.batchTracking ? book.onHand(productId, batchId) : book.onHand(productId);
      const variance = round3(toNumber(line.countedQuantity!) - expected);
      const unitCost = book.unitCost(productId, batchId);
      if (variance !== 0) {
        if (variance > 0) book.receive(productId, batchId, variance, unitCost);
        else book.issue(productId, batchId, -variance);
        await tx.stockMovement.create({
          data: {
            companyId: doc.companyId,
            siteId: doc.siteId,
            documentId: doc.id,
            documentLineId: line.id,
            productId,
            batchId,
            direction: variance > 0 ? 'IN' : 'OUT',
            quantity: Math.abs(variance),
            unitCost,
            occurredAt: doc.issuedOn,
          },
        });
      }
      await tx.documentLine.update({
        where: { id: line.id },
        data: {
          batchId,
          expectedQuantity: expected,
          quantity: Math.abs(variance),
          unitPrice: unitCost,
          discountPercent: 0,
          finalUnitPrice: unitCost,
          lineTotal: round4(variance * unitCost),
        },
      });
    }

    await saveAverages(tx, doc.companyId, doc.siteId, book);
  }

  private async enqueueExtraction(captureId: string, documentId: string, companyId: string) {
    const jobId = ocrJobId(captureId);
    try {
      const existingJob = await this.ocrQueue.getJob(jobId);
      if (existingJob) {
        const state = await existingJob.getState();
        if (state === 'waiting' || state === 'delayed' || state === 'active' || state === 'waiting-children' || state === 'prioritized') {
          return;
        }
        await existingJob.remove().catch(() => undefined);
      }
      await this.ocrQueue.add(OCR_JOB_EXTRACT, { captureId, documentId, companyId }, { ...OCR_JOB_OPTIONS, jobId });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not enqueue OCR job';
      if (message.toLowerCase().includes('already exists') || message.toLowerCase().includes('duplicat')) {
        return;
      }
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

  /** Any active site of the company can receive a transfer, even one the sender isn't assigned to. */
  private async assertTargetSite(companyId: string, targetSiteId: string, siteId: string) {
    if (targetSiteId === siteId) throw new BadRequestException('A transfer needs two different sites');
    const site = await this.prisma.site.findFirst({
      where: { id: targetSiteId, companyId },
      select: { id: true, isActive: true, name: true },
    });
    if (!site) throw new NotFoundException('Receiving site not found');
    if (!site.isActive) throw new BadRequestException(`${site.name} is deactivated and can't receive stock`);
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

  private assertWriteOffShape(type: string, direction: string) {
    if (type !== 'PROTOCOL' || direction !== 'OUT') {
      throw new BadRequestException('A write-off reason is only allowed on an outgoing goods handover (PROTOCOL)');
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
    writeOffReason: DocumentRow['writeOffReason'];
    postedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    partner: DocumentRow['partner'];
    site: DocumentRow['site'];
    targetSite: DocumentRow['targetSite'];
  }) {
    return {
      id: doc.id,
      type: doc.type,
      status: doc.status,
      direction: doc.direction,
      documentNumber: doc.number,
      issuedOn: isoDate(doc.issuedOn),
      deliveryAddress: doc.deliveryAddress,
      notes: doc.notes,
      writeOffReason: doc.writeOffReason,
      postedAt: doc.postedAt,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
      partner: doc.partner,
      site: doc.site,
      targetSite: doc.targetSite,
    };
  }

  private async outShortfalls(db: Prisma.TransactionClient, doc: DocumentRow) {
    const lines = doc.lines.filter((line) => line.productId && line.product && toNumber(line.quantity) > 0);
    if (lines.length === 0) return [];
    const sums = await db.stockMovement.groupBy({
      by: ['productId', 'batchId', 'direction'],
      where: {
        companyId: doc.companyId,
        siteId: doc.siteId,
        productId: { in: [...new Set(lines.map((line) => line.productId!))] },
      },
      _sum: { quantity: true },
    });
    const batchIds = [...new Set(sums.map((row) => row.batchId).filter((id): id is string => Boolean(id)))];
    const batches = batchIds.length
      ? await db.batch.findMany({ where: { id: { in: batchIds } }, select: { id: true, batchNumber: true } })
      : [];
    const batchNumbers = new Map(batches.map((batch) => [batch.id, batch.batchNumber]));
    const onHand = onHandByKey(
      sums.map((row) => ({
        productId: row.productId,
        batchNumber: row.batchId ? (batchNumbers.get(row.batchId) ?? null) : null,
        direction: row.direction,
        quantity: toNumber(row._sum.quantity ?? 0),
      })),
    );
    return stockShortfalls(
      lines.map((line) => ({
        productId: line.productId!,
        productName: line.product!.name,
        batchTracking: line.product!.batchTracking,
        batchNumber: line.ocrBatchNumber,
        quantity: toNumber(line.quantity),
      })),
      onHand,
    );
  }

  /** Expiry comes from the stored batch when it exists: the line's date is only what was typed or read. */
  private async expiryWarnings(doc: DocumentRow) {
    const header = { type: doc.type, direction: doc.direction, writeOffReason: doc.writeOffReason, issuedOn: isoDate(doc.issuedOn) };
    if (!expiryGuarded(header)) return [];
    const tracked = doc.lines.filter((line) => line.productId && line.product?.batchTracking && line.ocrBatchNumber?.trim());
    if (tracked.length === 0) return [];
    const batches = await this.prisma.batch.findMany({
      where: {
        companyId: doc.companyId,
        productId: { in: [...new Set(tracked.map((line) => line.productId!))] },
        batchNumber: { in: [...new Set(tracked.map((line) => line.ocrBatchNumber!.trim()))] },
      },
      select: { productId: true, batchNumber: true, expiryDate: true },
    });
    const expiryOf = new Map(batches.map((batch) => [`${batch.productId}\u0000${batch.batchNumber}`, batch.expiryDate]));
    return expiredBatchWarnings(
      header,
      tracked.map((line) => {
        const stored = expiryOf.get(`${line.productId}\u0000${line.ocrBatchNumber!.trim()}`);
        const expiry = stored ?? line.ocrExpiryDate;
        return { productName: line.product!.name, batchNumber: line.ocrBatchNumber, expiryDate: expiry ? isoDate(expiry) : null };
      }),
    );
  }

  /** Live book quantity and cost per line of a draft count sheet. */
  private async stocktakePreview(doc: DocumentRow): Promise<Map<string, StocktakeLinePreview>> {
    const lines = doc.lines.filter((line) => line.productId && line.product);
    const productIds = [...new Set(lines.map((line) => line.productId!))];
    if (productIds.length === 0) return new Map();
    const [{ book }, batches] = await Promise.all([
      loadCostBook(this.prisma, doc.companyId, doc.siteId, productIds),
      this.prisma.batch.findMany({
        where: { companyId: doc.companyId, productId: { in: productIds } },
        select: { id: true, productId: true, batchNumber: true },
      }),
    ]);
    const batchIdOf = new Map(batches.map((batch) => [`${batch.productId}\u0000${batch.batchNumber}`, batch.id]));
    return new Map(
      lines.map((line) => {
        const productId = line.productId!;
        if (!line.product!.batchTracking) {
          return [line.id, { expected: book.onHand(productId), unitCost: book.unitCost(productId, null) }];
        }
        const batchId = batchIdOf.get(`${productId}\u0000${line.ocrBatchNumber?.trim() ?? ''}`) ?? null;
        return [
          line.id,
          { expected: batchId ? book.onHand(productId, batchId) : 0, unitCost: book.unitCost(productId, batchId) },
        ];
      }),
    );
  }

  private async detail(doc: DocumentRow) {
    const writable = WRITABLE.has(doc.status);
    const [shortfalls, warnings, preview] = await Promise.all([
      doc.direction === 'OUT' && writable && doc.type !== 'STOCKTAKE' ? this.outShortfalls(this.prisma, doc) : [],
      writable ? this.expiryWarnings(doc) : [],
      doc.type === 'STOCKTAKE' && writable ? this.stocktakePreview(doc) : new Map<string, StocktakeLinePreview>(),
    ]);
    return this.serializeDetail(doc, shortfalls, warnings, preview);
  }

  private stocktakeLine(line: LineRow, preview: Map<string, StocktakeLinePreview>) {
    const live = preview.get(line.id);
    const expected = line.expectedQuantity !== null ? toNumber(line.expectedQuantity) : (live?.expected ?? null);
    const unitCost = line.expectedQuantity !== null ? toNumber(line.unitPrice) : (live?.unitCost ?? 0);
    const counted = line.countedQuantity === null ? null : toNumber(line.countedQuantity);
    const variance = counted === null || expected === null ? null : round3(counted - expected);
    return {
      countedQuantity: counted,
      expectedQuantity: expected,
      varianceQuantity: variance,
      varianceValue: variance === null ? null : Math.round(variance * unitCost * 100) / 100,
      unitCost,
    };
  }

  private serializeDetail(
    doc: DocumentRow,
    shortfalls: string[] = [],
    warnings: string[] = [],
    preview = new Map<string, StocktakeLinePreview>(),
  ) {
    const errors = [...canDocumentBePosted(doc).errors, ...shortfalls];
    const posting = { ok: errors.length === 0, errors, warnings, confirmExpired: warnings.length > 0 };
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

    const lines = doc.lines.map((line) => ({
      id: line.id,
      position: line.position,
      sourceCaptureId: line.sourceCaptureId,
      printed: {
        description: line.ocrDescription,
        supplierCode: line.supplierProductCode,
        unit: line.ocrUnit,
      },
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
      expiryDate: line.ocrExpiryDate ? isoDate(line.ocrExpiryDate) : null,
      batch: line.batch
        ? {
            id: line.batch.id,
            batchNumber: line.batch.batchNumber,
            expiryDate: line.batch.expiryDate ? isoDate(line.batch.expiryDate) : null,
          }
        : null,
      verified: line.verified,
      ...(doc.type === 'STOCKTAKE' ? { stocktake: this.stocktakeLine(line, preview) } : {}),
    }));

    const stocktake =
      doc.type === 'STOCKTAKE'
        ? lines.reduce(
            (summary, line) => {
              const value = line.stocktake?.varianceValue ?? null;
              if (line.stocktake?.countedQuantity === null) return summary;
              summary.counted += 1;
              if (value !== null && value < 0) summary.shortageValue += value;
              if (value !== null && value > 0) summary.surplusValue += value;
              if (line.stocktake?.varianceQuantity) summary.linesWithVariance += 1;
              return summary;
            },
            { lines: lines.length, counted: 0, linesWithVariance: 0, shortageValue: 0, surplusValue: 0 },
          )
        : null;

    return {
      document: {
        ...this.serializeHeader(doc),
        extraction: {
          confidence,
          reading: captures.some((row) => row.extractionStatus === 'QUEUED' || row.extractionStatus === 'RUNNING'),
        },
        lines,
        captures,
        stocktake: stocktake && {
          ...stocktake,
          shortageValue: Math.round(stocktake.shortageValue * 100) / 100,
          surplusValue: Math.round(stocktake.surplusValue * 100) / 100,
          netValue: Math.round((stocktake.shortageValue + stocktake.surplusValue) * 100) / 100,
        },
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
