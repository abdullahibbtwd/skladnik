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
  DOCUMENT_TYPE_LABELS,
  canCreatePendingProduct,
  defaultStockDirection,
  documentTotals,
  isOperationalManager,
  isPaperDocumentType,
  isStockOperationType,
  isTillDocumentType,
  isDocumentManager,
  normalizeDocumentNumber,
  quantityPrecisionProblem,
  reconcileTotals,
  seriesForDocument,
  taxIdProblemMessage,
  taxIdProblems,
  vatPeriodOf,
  type AuthUser,
  type DocumentPaymentMethod,
  type DocumentType,
  type TotalsCheck,
} from '@skladnik/shared';
import { changes, recordActivity } from '../activity/record-activity';
import { apiBadRequest, apiConflict, apiForbidden } from '../common/api-error';
import { presentDocumentDetailForRole, seesFinancials } from '../common/staff-view';
import { isRealPostedActivity, openingBalanceRoleAllowed } from './opening-balance';
import { toNumber } from '../common/decimal';
import { takeSeriesNumber } from '../company/document-series';
import { rememberSupplierCode } from '../extraction/extraction-apply.service';
import { barcodeForMatching } from '../extraction/barcode';
import { NameIndex, productKey } from '../extraction/name-matching';
import { resolveScannedQuantity, scanLineChecks } from '../extraction/quantity-cell';
import { OCR_JOB_EXTRACT, OCR_JOB_OPTIONS, OCR_QUEUE, ocrJobId, type OcrJobData } from '../extraction/ocr.constants';
import { splitProductText } from '../extraction/product-text';
import { PrismaService } from '../prisma/prisma.service';
import { nextProductCode } from '../products/product-code';
import { businessDate } from '../sales/business-day';
import { loadCostBook, lockSites, saveAverages, siteLedger } from '../stock/ledger';
import { StorageService } from '../storage/storage.service';
import {
  canDocumentBePosted,
  expiredBatchWarnings,
  expiryGuarded,
  isExpiredOn,
} from './can-document-be-posted';
import { deleteOrphanAutoProducts } from './auto-products';
import { isAutomaticBatchNumber, nextAutomaticBatchNumber } from './auto-batch';
import { assertDocumentWriteAccess } from './document-access';
import { findDuplicateDocument, lockDocumentNumber, type DuplicateDocument, type DuplicateKey } from './document-duplicates';
import {
  classifyDocumentLifecycle,
  lifecycleMessages,
  type LifecycleIssue,
} from './document-lifecycle';
import { REVERSAL_SUFFIX, planReversal, type OriginalMovement } from './reversal';
import { onHandByKey, shortfallMessage, stockShortfalls } from './stock-availability';
import { computeLineAmounts } from './document-pricing';
import {
  CreateDocumentDto,
  CreateDocumentLineDto,
  CreateProductFromLineDto,
  ListDocumentsQueryDto,
  ReverseDocumentDto,
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
  partner: { select: { id: true, name: true, kind: true, eik: true, vatNumber: true, verified: true } },
  site: siteSelect,
  targetSite: siteSelect,
  lines: { orderBy: { position: 'asc' as const }, include: lineInclude },
  captures: { orderBy: { pageNumber: 'asc' as const } },
  createdBy: { select: { id: true, name: true } },
  reversalOf: { select: { id: true, number: true, issuedOn: true } },
  reversedBy: { select: { id: true, number: true, issuedOn: true, notes: true, createdBy: { select: { name: true } } } },
} satisfies Prisma.DocumentInclude;

type DocumentRow = Prisma.DocumentGetPayload<{ include: typeof documentInclude }>;
type LineRow = DocumentRow['lines'][number];

type StocktakeLinePreview = { expected: number; unitCost: number };

type ProductSuggestion = {
  id: string;
  name: string;
  code: string;
  unit: string;
  vatRate: number;
  batchTracking: boolean;
  score: number;
  status?: string;
};

type PrintedInput = {
  printedTaxableBase?: number | null;
  printedVatAmount?: number | null;
  printedTotal?: number | null;
  paymentMethod?: DocumentPaymentMethod | null;
};

type PostingChecks = {
  errors: string[];
  /** Issues that block post but still allow Staff to submit for review (SKL-01/03/08). */
  reviewWarnings: string[];
  /** True when submit-for-review is allowed (no future date / empty lines). */
  canSubmit: boolean;
  expired: string[];
  expiredLineIds: Set<string>;
  dateWarning: string | null;
  /** date=expiry and old-date confirmations (SKL-01). */
  dateConfirmations: string[];
  duplicate: DuplicateDocument | null;
  totals: TotalsCheck | null;
};

const WRITABLE = new Set(['DRAFT', 'REVIEW']);

/** A capture is created a moment before its job is queued; don't mistake that gap for a lost job. */
const LOST_READ_GRACE_MS = 30_000;

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
        partner: { select: { id: true, name: true, kind: true, eik: true, vatNumber: true, verified: true } },
        site: siteSelect,
        targetSite: siteSelect,
        createdBy: { select: { id: true, name: true } },
        reversalOf: documentInclude.reversalOf,
        reversedBy: documentInclude.reversedBy,
        _count: { select: { lines: true, captures: true } },
      },
      orderBy: [{ issuedOn: 'desc' }, { createdAt: 'desc' }],
    });
    return {
      documents: documents.map((doc) => ({
        ...this.serializeHeader(doc, user.role),
        createdBy: doc.createdBy,
        lineCount: doc._count.lines,
        captureCount: doc._count.captures,
      })),
    };
  }

  async get(user: AuthUser, id: string) {
    const document = await this.findInCompany(user, id);
    if (await this.settleLostReads(document)) return this.detail(user, await this.findInCompany(user, id));
    return this.detail(user, document);
  }

  /**
   * A capture still "reading" whose queue job is gone or finished will never be updated by the worker
   * (the job stalled too often, or Redis lost it). Mark it failed so the screen can offer a retry.
   */
  private async settleLostReads(doc: DocumentRow) {
    const reading = doc.captures.filter(
      (capture) =>
        (capture.extractionStatus === 'QUEUED' || capture.extractionStatus === 'RUNNING') &&
        Date.now() - capture.updatedAt.getTime() > LOST_READ_GRACE_MS,
    );
    let settled = false;
    for (const capture of reading) {
      const job = await this.ocrQueue.getJob(ocrJobId(capture.id)).catch(() => undefined);
      const state = job ? await job.getState().catch(() => 'unknown') : 'missing';
      if (!['failed', 'completed', 'missing', 'unknown'].includes(state)) continue;
      const message = job?.failedReason || 'Reading was interrupted before it finished';
      const { count } = await this.prisma.documentCapture.updateMany({
        where: { id: capture.id, extractionStatus: { in: ['QUEUED', 'RUNNING'] } },
        data: { extractionStatus: 'FAILED', extractionError: message, ocrRaw: { extractionFailed: true, error: message } },
      });
      settled ||= count > 0;
    }
    return settled;
  }

  async create(user: AuthUser, dto: CreateDocumentDto) {
    if (isTillDocumentType(dto.type)) throw new BadRequestException('Sales are recorded at the till');
    assertDocumentWriteAccess(user, 'create', undefined, dto.type);
    await this.assertSite(user, dto.siteId);
    if (dto.type === 'OPENING_BALANCE') await this.assertOpeningBalanceAllowed(user, dto.siteId);
    if (dto.partnerId) await this.assertPartner(user.companyId, dto.partnerId);
    if (dto.targetSiteId) {
      if (dto.type !== 'TRANSFER') throw new BadRequestException('Only a transfer has a receiving site');
      await this.assertTargetSite(user.companyId, dto.targetSiteId, dto.siteId);
    }

    const direction = isStockOperationType(dto.type)
      ? defaultStockDirection(dto.type)
      : (dto.direction ?? defaultStockDirection(dto.type));
    this.assertWriteOffReason(dto.type, dto.writeOffReason ?? null);
    this.assertPrintedFields(dto.type, dto);
    const typed = dto.documentNumber?.trim() || null;
    const series = seriesForDocument(dto.type, direction);
    if (!typed && !series) throw new BadRequestException('Enter the number printed on the document');
    const partnerId = dto.partnerId ?? null;
    const document = await this.prisma.$transaction(async (tx) => {
      let number: string;
      if (typed) {
        number = typed;
        await lockDocumentNumber(tx, user.companyId, number);
        await this.assertNotDuplicate(tx, { companyId: user.companyId, partnerId, type: dto.type, number });
      } else {
        // Our own numbers are never reused, not even from a cancelled document.
        number = await takeSeriesNumber(tx, user.companyId, series!, async (candidate) => {
          await lockDocumentNumber(tx, user.companyId, candidate);
          const used = await tx.document.findFirst({
            where: { companyId: user.companyId, type: dto.type, number: candidate },
            select: { id: true },
          });
          return Boolean(used);
        });
      }
      return tx.document.create({
        data: {
          companyId: user.companyId,
          siteId: dto.siteId,
          targetSiteId: dto.targetSiteId ?? null,
          partnerId,
          type: dto.type,
          direction,
          status: 'DRAFT',
          number,
          numberKey: normalizeDocumentNumber(number),
          issuedOn: new Date(dto.issuedOn),
          deliveryAddress: dto.deliveryAddress?.trim() || null,
          notes: dto.notes?.trim() || null,
          writeOffReason: dto.writeOffReason ?? null,
          createdById: user.id,
          ...this.printedData(dto),
        },
        include: documentInclude,
      });
    });
    await this.log(user, document, 'CREATE', {
      type: document.type,
      ...(typed ? {} : { numberedFrom: series }),
      ...(document.writeOffReason ? { writeOffReason: document.writeOffReason } : {}),
      ...(document.targetSiteId ? { targetSiteId: document.targetSiteId } : {}),
    });
    return this.detail(user, document);
  }

  async update(user: AuthUser, id: string, dto: UpdateDocumentDto) {
    const existing = await this.findInCompany(user, id, true);
    assertDocumentWriteAccess(user, 'edit', existing);
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
    if (dto.documentNumber !== undefined) {
      const next = dto.documentNumber.trim();
      data.number = next;
      data.numberKey = normalizeDocumentNumber(next);
    }
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
    const nextReason = dto.writeOffReason !== undefined ? dto.writeOffReason : existing.writeOffReason;
    this.assertWriteOffReason(nextType, nextReason);
    if (nextReason !== existing.writeOffReason) data.writeOffReason = nextReason;
    this.assertPrintedFields(nextType, dto);
    Object.assign(data, this.printedData(dto));

    const nextNumber = dto.documentNumber !== undefined ? dto.documentNumber.trim() : existing.number;
    const nextPartnerId = dto.partnerId !== undefined ? dto.partnerId : existing.partnerId;
    const keyChanged = nextNumber !== existing.number || nextPartnerId !== existing.partnerId || nextType !== existing.type;

    const document = await this.prisma.$transaction(async (tx) => {
      if (keyChanged) {
        await lockDocumentNumber(tx, user.companyId, nextNumber);
        await this.assertNotDuplicate(tx, {
          companyId: user.companyId,
          partnerId: nextPartnerId,
          type: nextType,
          number: nextNumber,
          excludeId: existing.id,
        });
      }
      return tx.document.update({ where: { id: existing.id }, data, include: documentInclude });
    });
    const diff = changes(this.headerSnapshot(existing), this.headerSnapshot(document));
    if (diff) await this.log(user, document, 'UPDATE', {}, diff);
    return this.detail(user, document);
  }

  /** Header fields compared for the activity log. */
  private headerSnapshot(doc: DocumentRow) {
    return {
      type: doc.type,
      direction: doc.direction,
      number: doc.number,
      issuedOn: isoDate(doc.issuedOn),
      site: doc.site.name,
      targetSite: doc.targetSite?.name ?? null,
      partner: doc.partner?.name ?? null,
      deliveryAddress: doc.deliveryAddress,
      notes: doc.notes,
      writeOffReason: doc.writeOffReason,
      paymentMethod: doc.paymentMethod,
      printedTaxableBase: doc.printedTaxableBase,
      printedVatAmount: doc.printedVatAmount,
      printedTotal: doc.printedTotal,
    };
  }

  /** Line fields compared for the activity log. */
  private lineSnapshot(line: LineRow) {
    return {
      product: line.product ? `${line.product.code} ${line.product.name}` : null,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      discountPercent: line.discountPercent,
      vatRate: line.vatRate,
      batchNumber: line.ocrBatchNumber,
      expiryDate: line.ocrExpiryDate ? isoDate(line.ocrExpiryDate) : null,
      countedQuantity: line.countedQuantity,
    };
  }

  async addLine(user: AuthUser, id: string, dto: CreateDocumentLineDto) {
    const existing = await this.findInCompany(user, id, true);
    assertDocumentWriteAccess(user, 'edit', existing);
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
      if (dto.countedQuantity !== undefined && dto.countedQuantity !== null) {
        this.assertQuantityPrecision(dto.countedQuantity, product);
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
      await this.log(user, existing, 'LINE_ADD', { line: position + 1 }, {
        before: {},
        after: { product: `${product.code} ${product.name}`, countedQuantity: dto.countedQuantity ?? null },
      });
      return this.get(user, existing.id);
    }

    const quantity = this.requireQuantity(dto, product);
    // Staff never set purchase prices (Section C recommended default); write-off cost is applied at post from the book.
    const unitPrice = seesFinancials(user.role) ? dto.unitPrice ?? 0 : 0;
    const amounts = computeLineAmounts(quantity, unitPrice, seesFinancials(user.role) ? (dto.discountPercent ?? 0) : 0);
    await this.prisma.$transaction(async (tx) => {
      const resolved = await this.resolveBatchNumber(tx, {
        companyId: user.companyId,
        siteId: existing.siteId,
        productId: product.id,
        batchTracking: product.batchTracking,
        batchNumber: dto.batchNumber,
        expiryDate: dto.expiryDate,
      });
      await tx.documentLine.create({
        data: {
          companyId: user.companyId,
          documentId: existing.id,
          productId: product.id,
          position,
          quantity,
          unitPrice,
          discountPercent: amounts.discountPercent,
          finalUnitPrice: amounts.finalUnitPrice,
          lineTotal: amounts.lineTotal,
          vatRate: dto.vatRate ?? toNumber(product.vatRate),
          unit: product.unit,
          ocrDescription: product.name,
          ocrBatchNumber: resolved.batchNumber,
          ocrExpiryDate: dto.expiryDate ? new Date(dto.expiryDate) : null,
        },
      });
    });
    await this.log(user, existing, 'LINE_ADD', { line: position + 1 }, {
      before: {},
      after: { product: `${product.code} ${product.name}`, quantity, unitPrice, discountPercent: amounts.discountPercent },
    });
    return this.get(user, existing.id);
  }

  async updateLine(user: AuthUser, id: string, lineId: string, dto: UpdateDocumentLineDto) {
    const existing = await this.findInCompany(user, id, true);
    assertDocumentWriteAccess(user, 'edit', existing);
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
      if (dto.countedQuantity !== undefined && dto.countedQuantity !== null && line.product) {
        this.assertQuantityPrecision(dto.countedQuantity, line.product);
      }
      await this.prisma.documentLine.update({
        where: { id: line.id },
        data: {
          ...(dto.countedQuantity !== undefined ? { countedQuantity: dto.countedQuantity } : {}),
          ...(dto.batchNumber !== undefined ? { ocrBatchNumber: dto.batchNumber?.trim() || null } : {}),
          ...(dto.expiryDate !== undefined ? { ocrExpiryDate: dto.expiryDate ? new Date(dto.expiryDate) : null } : {}),
        },
      });
      await this.logLineChange(user, existing, line);
      return this.get(user, existing.id);
    }

    const productId = dto.productId ?? line.productId;
    const product = productId ? await this.assertProduct(user.companyId, productId) : null;
    const productChanged = Boolean(product && product.id !== line.productId);
    const explicitQty = dto.quantity !== undefined || dto.qty !== undefined;
    // CAF-01: linking a suggestion re-reads the quantity cell. It must not fall back to 1.
    const storedQty = toNumber(line.quantity);
    const scanned = resolveScannedQuantity({
      printed: line.ocrUnit,
      modelQty: storedQty > 0 ? storedQty : 0,
      productUnit: product?.unit ?? line.product?.unit ?? line.unit,
      keepQuantity: explicitQty || line.quantityConfirmed || dto.confirmQuantity ? storedQty : null,
    });
    const quantity = explicitQty
      ? this.requireQuantity(dto, product ?? line.product ?? undefined)
      : scanned.quantity > 0
        ? scanned.quantity
        : storedQty;
    const quantityConfirmed = explicitQty || dto.confirmQuantity || line.quantityConfirmed;
    const unitConfirmed = Boolean(dto.confirmUnit) || line.unitConfirmed;
    const unit =
      dto.confirmUnit && product
        ? product.unit
        : scanned.unitCheck
          ? (scanned.unit ?? line.unit)
          : (scanned.unit ?? (productChanged && product ? product.unit : line.unit));
    if (product ?? line.product) {
      this.assertQuantityPrecision(quantity, { ...(product ?? line.product)!, unit: unit ?? (product ?? line.product)!.unit });
    }
    const unitPrice = seesFinancials(user.role)
      ? (dto.unitPrice ?? toNumber(line.unitPrice))
      : toNumber(line.unitPrice);
    const discountPercent = seesFinancials(user.role)
      ? (dto.discountPercent ?? toNumber(line.discountPercent))
      : toNumber(line.discountPercent);
    const batchNumber = dto.batchNumber !== undefined ? dto.batchNumber : line.ocrBatchNumber;
    const expiryDate = dto.expiryDate !== undefined ? dto.expiryDate : line.ocrExpiryDate?.toISOString().slice(0, 10);
    if (product) this.assertBatchFields(product, batchNumber, expiryDate);

    const amounts = computeLineAmounts(quantity, unitPrice, discountPercent);
    await this.prisma.$transaction(async (tx) => {
      const tracked = product ?? line.product;
      const resolved =
        tracked?.batchTracking
          ? await this.resolveBatchNumber(tx, {
              companyId: user.companyId,
              siteId: existing.siteId,
              productId: tracked.id,
              batchTracking: true,
              batchNumber,
              expiryDate,
            })
          : { batchNumber: null as string | null, automatic: false };
      await tx.documentLine.update({
        where: { id: line.id },
        data: {
          // ocrDescription is what the supplier printed; keep it so review can compare against the photo.
          ...(productChanged && product ? { productId: product.id } : {}),
          ...(unit ? { unit } : {}),
          quantity,
          quantityConfirmed,
          unitConfirmed,
          unitPrice,
          discountPercent: amounts.discountPercent,
          finalUnitPrice: amounts.finalUnitPrice,
          lineTotal: amounts.lineTotal,
          ...(dto.freeOfCharge !== undefined ? { freeOfCharge: dto.freeOfCharge } : {}),
          ...(dto.vatRate !== undefined ? { vatRate: dto.vatRate } : {}),
          ...(tracked?.batchTracking
            ? {
                ocrBatchNumber: resolved.batchNumber,
                ocrExpiryDate: expiryDate ? new Date(expiryDate) : null,
              }
            : {
                ...(dto.batchNumber !== undefined ? { ocrBatchNumber: dto.batchNumber?.trim() || null } : {}),
                ...(dto.expiryDate !== undefined ? { ocrExpiryDate: dto.expiryDate ? new Date(dto.expiryDate) : null } : {}),
              }),
        },
      });
      if (!productChanged || !product) return;
      await rememberSupplierCode(tx, user.companyId, this.codeSupplierId(existing), product.id, line.supplierProductCode, true);
      await deleteOrphanAutoProducts(tx, user.companyId, existing.id);
    });
    await this.logLineChange(user, existing, line);
    return this.get(user, existing.id);
  }

  private async logLineChange(user: AuthUser, doc: DocumentRow, before: LineRow) {
    const after = await this.prisma.documentLine.findUniqueOrThrow({ where: { id: before.id }, include: lineInclude });
    const diff = changes(this.lineSnapshot(before), this.lineSnapshot(after));
    if (diff) await this.log(user, doc, 'LINE_UPDATE', { lineId: before.id, line: before.position + 1 }, diff);
  }

  /**
   * Creates a product from an unmatched scanned line and links it.
   * CAF-02: Staff may do this only as PENDING_REVIEW (not from the Products screen,
   * and not as an edit of an existing product). Managers still create an active product.
   */
  async createProductFromLine(user: AuthUser, id: string, lineId: string, dto: CreateProductFromLineDto) {
    if (!canCreatePendingProduct(user.role)) {
      throw apiForbidden('INSUFFICIENT_ROLE', 'Нямате права за това действие');
    }
    const existing = await this.findInCompany(user, id, true);
    // Staff: own draft only. The 'manage' action stays manager-only (document-access).
    if (user.role === 'STAFF') assertDocumentWriteAccess(user, 'edit', existing);
    else assertDocumentWriteAccess(user, 'manage', existing);
    this.assertWritable(existing.status);
    const line = existing.lines.find((row) => row.id === lineId);
    if (!line) throw new NotFoundException('Line not found');
    // SKL-03: strip batch/expiry patterns that OCR left in the name.
    const name = splitProductText(dto.name.trim(), line.supplierProductCode).name || dto.name.trim();
    if (!name) throw apiBadRequest('PRODUCT_NAME_REQUIRED', 'Името на продукта е задължително');
    if (dto.unit === 'OTHER') {
      throw apiBadRequest('PRODUCT_UNIT_REQUIRED', 'Изберете мярка — „друго“ не е допустимо по подразбиране от сканиране');
    }
    const group = dto.groupId
      ? await this.prisma.productGroup.findFirst({ where: { id: dto.groupId, companyId: user.companyId }, select: { id: true } })
      : null;
    if (dto.groupId && !group) throw apiBadRequest('PRODUCT_GROUP_REQUIRED', 'Групата на продукта е задължителна');
    const similar = await this.similarProducts(user.companyId, name, dto.unit);
    if (similar.length > 0) {
      const list = similar.map((product) => `«${product.name}» (${product.code})`).join(', ');
      throw apiConflict(
        'PRODUCT_SIMILAR_EXISTS',
        `Има подобен продукт със същата мярка: ${list}. Изберете го вместо нов.`,
        { names: list },
        { similarProducts: similar },
      );
    }
    // CAF-02: Staff products wait for a manager. They cannot be sold or posted until approved.
    const pending = user.role === 'STAFF';

    const product = await this.prisma.$transaction(async (tx) => {
      const code = dto.code?.trim() || (await nextProductCode(tx, user.companyId));
      const barcode = line.ocrBarcode?.trim() || null;
      const barcodeFree =
        barcode &&
        barcodeForMatching(barcode) &&
        !(await tx.productBarcode.findFirst({ where: { companyId: user.companyId, barcode: barcodeForMatching(barcode)! }, select: { id: true } }));
      const unitPrice = toNumber(line.finalUnitPrice ?? line.unitPrice);
      // CAF-02 / CAF-03: batch tracking defaults ON for a product created from a scan line.
      // Selling price stays empty (not copied from the purchase price) so it cannot be sold yet.
      const batchTracking = dto.batchTracking ?? true;
      const created = await tx.product
        .create({
          data: {
            companyId: user.companyId,
            groupId: group?.id ?? null,
            name,
            code,
            unit: dto.unit,
            vatRate: dto.vatRate,
            purchasePrice: unitPrice,
            sellingPrice: pending ? null : (dto.sellingPrice ?? null),
            batchTracking,
            status: pending ? 'PENDING_REVIEW' : 'ACTIVE',
            createdFromDocumentId: existing.id,
            ...(barcodeFree
              ? { barcodes: { create: { companyId: user.companyId, barcode: barcodeForMatching(barcode)! } } }
              : {}),
          },
        })
        .catch((error: unknown) => {
          if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
            throw new ConflictException(`A product with code ${code} already exists`);
          }
          throw error;
        });
      const linked = resolveScannedQuantity({
        printed: line.ocrUnit,
        modelQty: toNumber(line.quantity),
        productUnit: created.unit,
        keepQuantity: line.quantityConfirmed ? toNumber(line.quantity) : null,
      });
      await tx.documentLine.update({
        where: { id: line.id },
        data: {
          productId: created.id,
          unit: linked.unitCheck ? (linked.unit ?? created.unit) : created.unit,
          quantity: linked.quantity > 0 ? linked.quantity : toNumber(line.quantity),
        },
      });
      await rememberSupplierCode(tx, user.companyId, this.codeSupplierId(existing), created.id, line.supplierProductCode, true);
      await deleteOrphanAutoProducts(tx, user.companyId, existing.id);
      return created;
    });
    await this.log(user, existing, 'LINE_CREATE_PRODUCT', { lineId, productId: product.id, code: product.code });
    await recordActivity(this.prisma, user, {
      entityType: 'Product',
      entityId: product.id,
      action: 'CREATE',
      label: product.name,
      after: {
        name: product.name,
        code: product.code,
        unit: product.unit,
        status: product.status,
        batchTracking: product.batchTracking,
      },
      metadata: { source: 'scan-line', documentId: existing.id, lineId, documentNumber: existing.number },
    });
    return this.get(user, existing.id);
  }

  /** CAF-02: same unit and a fuzzy name match — return those instead of creating a second product. */
  private async similarProducts(companyId: string, name: string, unit: string) {
    const products = await this.prisma.product.findMany({
      where: { companyId, unit: unit as never, status: { not: 'ARCHIVED' } },
      select: { id: true, name: true, code: true },
    });
    const index = new NameIndex(products, productKey, 0.88, true);
    const found = index.find(name);
    // Suggest can score shared brand words highly even when sizes differ; only keep same-number hits.
    const wantNumbers = productKey(name)
      .match(/\d+(?:\.\d+)?/g)
      ?.join(' ');
    const ranked = index.suggest(name, 5).filter((row) => {
      if (row.score < 0.9) return false;
      const have = productKey(row.item.name)
        .match(/\d+(?:\.\d+)?/g)
        ?.join(' ');
      return Boolean(wantNumbers && have && wantNumbers === have);
    });
    const seen = new Set<string>();
    const matches: { id: string; name: string; code: string }[] = [];
    for (const product of [found, ...ranked.map((row) => row.item)]) {
      if (!product || seen.has(product.id)) continue;
      seen.add(product.id);
      matches.push(product);
    }
    return matches;
  }

  async removeLine(user: AuthUser, id: string, lineId: string) {
    const existing = await this.findInCompany(user, id, true);
    assertDocumentWriteAccess(user, 'edit', existing);
    this.assertWritable(existing.status);
    const line = existing.lines.find((row) => row.id === lineId);
    if (!line) throw new NotFoundException('Line not found');
    await this.prisma.$transaction(async (tx) => {
      await tx.documentLine.delete({ where: { id: line.id } });
      await deleteOrphanAutoProducts(tx, user.companyId, existing.id);
    });
    await this.log(user, existing, 'LINE_DELETE', { line: line.position + 1 }, { before: this.lineSnapshot(line), after: {} });
    return this.get(user, existing.id);
  }

  /** Supplier codes are remembered per supplier, so only for incoming documents with one. */
  private codeSupplierId(doc: { direction: string; partnerId: string | null }) {
    return doc.direction === 'IN' ? doc.partnerId : null;
  }

  /** Puts every product and batch with stock at the site on the count sheet (skipping ones already there). */
  async fillStocktake(user: AuthUser, id: string) {
    const existing = await this.findInCompany(user, id, true);
    assertDocumentWriteAccess(user, 'manage', existing);
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
    await this.log(user, existing, 'STOCKTAKE_FILL', { lines: data.length });
    return this.get(user, existing.id);
  }

  async setCounts(user: AuthUser, id: string, counts: StocktakeCountDto[]) {
    const existing = await this.findInCompany(user, id, true);
    assertDocumentWriteAccess(user, 'manage', existing);
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
    await this.log(user, existing, 'STOCKTAKE_COUNT', { lines: counts.length });
    return this.get(user, existing.id);
  }

  async submitForReview(user: AuthUser, id: string) {
    const existing = await this.findInCompany(user, id, true);
    assertDocumentWriteAccess(user, 'submit', existing);
    if (existing.status !== 'DRAFT') {
      throw new BadRequestException('Only a draft can be submitted for review');
    }
    // SKL-02 / SKL-10: future date and empty lines block submit on the server, not only in the UI.
    const checks = await this.postingChecks(existing, user);
    if (!checks.canSubmit) {
      const blockSubmit = checks.errors.filter(
        (message) => message.includes('бъдещето') || message.includes('Добавете поне един ред') || /future/i.test(message),
      );
      const first = blockSubmit[0] ?? checks.errors[0] ?? 'Документът не може да бъде изпратен за преглед';
      throw apiBadRequest(
        first.includes('бъдещето') || /future/i.test(first) ? 'DOCUMENT_DATE_FUTURE' : 'DOCUMENT_EMPTY_LINES',
        first,
      );
    }
    const document = await this.prisma.document.update({
      where: { id: existing.id },
      data: { status: 'REVIEW' },
      include: documentInclude,
    });
    await this.log(user, document, 'SUBMIT_REVIEW', {}, { before: { status: existing.status }, after: { status: document.status } });
    return this.detail(user, document);
  }

  async post(user: AuthUser, id: string, options: { confirmExpired?: boolean; confirmDate?: boolean } = {}) {
    const existing = await this.findInCompany(user, id, true);
    assertDocumentWriteAccess(user, 'post', existing);
    if (existing.status !== 'REVIEW') {
      throw new BadRequestException('Submit the document for review before posting');
    }
    if (existing.type === 'OPENING_BALANCE') await this.assertOpeningBalanceAllowed(user, existing.siteId);
    const checks = await this.postingChecks(existing, user);
    if (checks.duplicate) this.throwDuplicate(checks.duplicate);
    if (checks.errors.length) {
      throw new BadRequestException(checks.errors.join('. '));
    }
    if (existing.type === 'TRANSFER') {
      await this.assertTargetSite(user.companyId, existing.targetSiteId!, existing.siteId);
    }
    if (checks.expired.length && !options.confirmExpired) {
      throw new BadRequestException(`${checks.expired.join('. ')}. Confirm to post it with expired stock.`);
    }
    if (checks.dateConfirmations.length && !options.confirmDate) {
      throw apiBadRequest(
        'DOCUMENT_DATE_CONFIRM',
        `${checks.dateConfirmations.join('. ')}. Потвърдете датата, за да осчетоводите.`,
        undefined,
        { warnings: checks.dateConfirmations },
      );
    }

    const posted = await this.prisma.$transaction(
      async (tx) => {
        // Conditional flip first: it row-locks the document, so a double tap can't write the ledger twice.
        const flipped = await tx.document.updateMany({
          where: { id: existing.id, status: 'REVIEW' },
          data: { status: 'POSTED', postedAt: new Date() },
        });
        if (flipped.count !== 1) throw new ConflictException('This document was already posted');

        await lockDocumentNumber(tx, existing.companyId, existing.number);
        const duplicate = await findDuplicateDocument(tx, this.duplicateKey(existing));
        if (duplicate) this.throwDuplicate(duplicate);

        // Costs and availability are read then written, so postings at a site run one at a time.
        await lockSites(tx, existing.targetSiteId ? [existing.siteId, existing.targetSiteId] : [existing.siteId]);

        if (existing.type === 'STOCKTAKE') {
          await this.writeStocktake(tx, existing);
        } else {
          if (existing.direction === 'OUT') {
            const shortfalls = await this.outShortfalls(tx, existing);
            if (shortfalls.length) {
              const first = shortfalls[0]!;
              throw apiBadRequest('INSUFFICIENT_STOCK', shortfalls.map(shortfallMessage).join('. '), {
                product: first.product,
                available: first.available,
                requested: first.requested,
                action: first.action,
              }, {
                errors: shortfalls.map((row) => ({
                  code: row.code,
                  message: shortfallMessage(row),
                  params: { product: row.product, available: row.available, requested: row.requested, action: row.action },
                })),
              });
            }
          }
          await this.writeMovements(tx, existing);
        }

        return tx.document.findUniqueOrThrow({ where: { id: existing.id }, include: documentInclude });
      },
      { timeout: 30_000 },
    );

    await this.log(user, posted, 'POST', {
      lines: posted.lines.length,
      ...(checks.totals ? { totals: checks.totals.calculated, printedTotal: checks.totals.printed.total } : {}),
      ...(checks.expired.length ? { confirmedExpired: checks.expired } : {}),
      ...(checks.dateConfirmations.length ? { confirmedDate: checks.dateConfirmations } : {}),
    }, { before: { status: existing.status }, after: { status: posted.status } });
    return this.detail(user, posted);
  }

  async cancel(user: AuthUser, id: string) {
    const existing = await this.findInCompany(user, id, true);
    assertDocumentWriteAccess(user, 'cancel', existing);
    if (existing.status === 'POSTED') {
      throw new BadRequestException('Posted documents cannot be cancelled — reverse with a new document');
    }
    if (existing.status === 'CANCELLED') {
      return this.detail(user, existing);
    }
    const { document, removedProducts } = await this.prisma.$transaction(async (tx) => {
      // Products a scan guessed for this draft go with it, unless something else has started using them.
      const removed = await deleteOrphanAutoProducts(tx, user.companyId, existing.id, { detach: true });
      const cancelled = await tx.document.update({
        where: { id: existing.id },
        data: { status: 'CANCELLED' },
        include: documentInclude,
      });
      return { document: cancelled, removedProducts: removed };
    });
    await this.log(
      user,
      document,
      'CANCEL',
      removedProducts ? { removedProducts } : {},
      { before: { status: existing.status }, after: { status: document.status } },
    );
    return this.detail(user, document);
  }

  /**
   * "Never deleted, only reversed": a posted document gets a linked opposite document, posted at once, whose
   * movements undo the original's one by one (same site, product, batch, quantity and cost). The original
   * stays as it was and shows who reversed it. A transfer is reversed from the receiving site back.
   */
  async reverse(user: AuthUser, id: string, dto: ReverseDocumentDto) {
    const original = await this.findInCompany(user, id, true);
    assertDocumentWriteAccess(user, 'reverse', original);
    if (original.status !== 'POSTED') {
      throw new BadRequestException('Only a posted document can be reversed; a draft is cancelled instead');
    }
    if (original.reversalOf) {
      throw new BadRequestException(`This document reverses ${original.reversalOf.number} and can't be reversed itself. Enter the document again instead`);
    }
    if (original.reversedBy) throw new ConflictException(`Already reversed by ${original.reversedBy.number}`);
    const transfer = original.type === 'TRANSFER';
    if (transfer && !user.allSites && !user.siteIds.includes(original.targetSiteId!)) {
      throw new ForbiddenException('Reversing a transfer takes the stock back out of the receiving site, which is outside your assigned locations');
    }
    const filedPeriod = await this.filedVatPeriod(original);
    if (filedPeriod && !dto.confirmFiledPeriod) {
      const message =
        `The VAT return for ${filedPeriod} was already generated with this document in it. Reversing takes it out of that ` +
        `purchase ledger, so the return will need a correction. Goods sent back to the supplier are recorded with their credit note instead`;
      throw new BadRequestException({ statusCode: 400, error: 'Bad Request', code: 'FILED_PERIOD_CONFIRM', message, warnings: [message] });
    }

    const reason = dto.reason.trim();
    const baseNumber = `${original.number}${REVERSAL_SUFFIX}`;
    let number = baseNumber;
    const now = new Date();
    const siteName = new Map([original.site, original.targetSite].filter((site) => site !== null).map((site) => [site.id, site.name]));
    const lineById = new Map(original.lines.map((line) => [line.id, line]));
    let reversalId: string;
    try {
      reversalId = await this.prisma.$transaction(
        async (tx) => {
          await lockDocumentNumber(tx, original.companyId, baseNumber);
          const already = await tx.document.findUnique({ where: { reversalOfId: original.id }, select: { number: true } });
          if (already) throw new ConflictException(`Already reversed by ${already.number}`);
          // The same supplier number can be reversed again after it was re-entered: -СТ, -СТ2, -СТ3…
          for (let attempt = 2; await tx.document.findFirst({ where: { companyId: original.companyId, number }, select: { id: true } }); attempt += 1) {
            number = `${baseNumber}${attempt}`;
          }
          const movements = await tx.stockMovement.findMany({
            where: { documentId: original.id },
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          });
          const siteIds = [...new Set(movements.map((row) => row.siteId))];
          await lockSites(tx, siteIds);
          const books = new Map<string, Awaited<ReturnType<typeof loadCostBook>>['book']>();
          for (const siteId of siteIds) {
            const productIds = [...new Set(movements.filter((row) => row.siteId === siteId).map((row) => row.productId))];
            books.set(siteId, (await loadCostBook(tx, original.companyId, siteId, productIds)).book);
          }
          const originals: OriginalMovement[] = movements.map((row) => ({
            id: row.id,
            siteId: row.siteId,
            documentLineId: row.documentLineId,
            productId: row.productId,
            batchId: row.batchId,
            direction: row.direction,
            quantity: toNumber(row.quantity),
            unitCost: row.unitCost === null ? null : toNumber(row.unitCost),
          }));
          const plan = planReversal(originals, books, (movement) => {
            const line = movement.documentLineId ? lineById.get(movement.documentLineId) : undefined;
            const name = line?.product?.name ?? 'Product';
            const batch = line?.batch?.batchNumber;
            return `${batch ? `${name} (batch ${batch})` : name} at ${siteName.get(movement.siteId) ?? 'the site'}`;
          });
          if (plan.shortfalls.length) {
            throw new BadRequestException(`Can't reverse ${original.number}. ${plan.shortfalls.join('. ')}`);
          }

          const created = await tx.document.create({
            data: {
              companyId: original.companyId,
              siteId: transfer ? original.targetSiteId! : original.siteId,
              targetSiteId: transfer ? original.siteId : null,
              partnerId: original.partnerId,
              type: original.type,
              // A transfer always goes OUT of siteId; everything else runs the other way.
              direction: transfer ? 'OUT' : original.direction === 'IN' ? 'OUT' : 'IN',
              status: 'POSTED',
              number,
              numberKey: normalizeDocumentNumber(number),
              issuedOn: new Date(`${businessDate(now)}T00:00:00Z`),
              // ACC-13: one clock reading for both timestamps so createdAt <= postedAt.
              createdAt: now,
              postedAt: now,
              notes: reason,
              writeOffReason: original.writeOffReason,
              paymentMethod: original.paymentMethod,
              printedTaxableBase: original.printedTaxableBase,
              printedVatAmount: original.printedVatAmount,
              printedTotal: original.printedTotal,
              createdById: user.id,
              reversalOfId: original.id,
              lines: {
                create: original.lines.map((line) => ({
                  companyId: original.companyId,
                  position: line.position,
                  productId: line.productId,
                  batchId: line.batchId,
                  supplierProductCode: line.supplierProductCode,
                  ocrDescription: line.ocrDescription,
                  unit: line.unit,
                  quantity: line.quantity,
                  unitPrice: line.unitPrice,
                  discountPercent: line.discountPercent,
                  finalUnitPrice: line.finalUnitPrice,
                  lineTotal: line.lineTotal,
                  vatRate: line.vatRate,
                  ocrBatchNumber: line.ocrBatchNumber,
                  ocrExpiryDate: line.ocrExpiryDate,
                  countedQuantity: line.countedQuantity,
                  expectedQuantity: line.expectedQuantity,
                  verified: true,
                })),
              },
            },
            select: { id: true, lines: { select: { id: true, position: true } } },
          });
          const newLineByPosition = new Map(created.lines.map((line) => [line.position, line.id]));
          await tx.stockMovement.createMany({
            data: plan.movements.map((movement) => {
              const line = movement.documentLineId ? lineById.get(movement.documentLineId) : undefined;
              return {
                companyId: original.companyId,
                siteId: movement.siteId,
                documentId: created.id,
                documentLineId: line ? (newLineByPosition.get(line.position) ?? null) : null,
                productId: movement.productId,
                batchId: movement.batchId,
                direction: movement.direction,
                quantity: movement.quantity,
                unitCost: movement.unitCost,
                reversalOfId: movement.reversalOfId,
                occurredAt: now,
              };
            }),
          });
          for (const [siteId, book] of books) await saveAverages(tx, original.companyId, siteId, book);
          return created.id;
        },
        { timeout: 30_000 },
      );
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('This document was already reversed');
      }
      throw error;
    }

    await this.log(user, original, 'REVERSE', { reason, reversal: number, ...(filedPeriod ? { confirmedFiledPeriod: filedPeriod } : {}) }, {
      before: { reversedBy: null },
      after: { reversedBy: number },
    });
    await this.log(user, { id: reversalId, number }, 'REVERSAL', { reverses: original.number, reason });
    return this.detail(user, await this.findInCompany(user, reversalId));
  }

  /** The VAT period whose generated return lists this purchase document, if any. */
  private async filedVatPeriod(doc: DocumentRow) {
    if ((doc.type !== 'INVOICE' && doc.type !== 'CREDIT_NOTE') || doc.vatCredit === 'EXCLUDED') return null;
    const period = doc.vatPeriod ?? vatPeriodOf(isoDate(doc.issuedOn));
    const filing = await this.prisma.complianceFiling.findFirst({
      where: { companyId: doc.companyId, kind: 'VAT_RETURN', period },
      select: { id: true },
    });
    return filing ? period : null;
  }

  async addCapture(user: AuthUser, id: string, file: Express.Multer.File) {
    const existing = await this.findInCompany(user, id, true);
    assertDocumentWriteAccess(user, 'edit', existing);
    this.assertWritable(existing.status);
    assertCaptureUpload(file);
    let nextPage = existing.captures.length === 0 ? 1 : Math.max(...existing.captures.map((row) => row.pageNumber)) + 1;
    const captureIds: string[] = [];
    const evidenceOnly = !isPaperDocumentType(existing.type);
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
    await this.log(user, existing, 'CAPTURE_ADD', {
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
    assertDocumentWriteAccess(user, 'create', undefined, dto.type);
    const replay = await this.findByClientRequest(user, dto.clientRequestId);
    if (replay) return this.detail(user, replay);

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
          numberKey: normalizeDocumentNumber(`SCAN-${documentId.slice(0, 8).toUpperCase()}`),
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
        if (concurrent) return this.detail(user, concurrent);
      }
      throw error;
    }

    for (const capture of document.captures) {
      await this.enqueueExtraction(capture.id, document.id, user.companyId);
    }
    await this.log(user, document, 'CREATE', {
      number: document.number,
      type: document.type,
      source: 'scan',
      ...(dto.capturedAt ? { capturedAt: dto.capturedAt } : {}),
    });
    await this.log(user, document, 'CAPTURE_ADD', { pages: document.captures.length, source: stored.pdf ? 'pdf' : 'image' });
    return this.detail(user, document);
  }

  async retryExtraction(user: AuthUser, id: string, captureId: string) {
    const existing = await this.findInCompany(user, id, true);
    assertDocumentWriteAccess(user, 'edit', existing);
    this.assertWritable(existing.status);
    const capture = existing.captures.find((row) => row.id === captureId);
    if (!capture) throw new NotFoundException('Capture not found');
    if (!isPaperDocumentType(existing.type)) {
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
    await this.log(user, existing, 'CAPTURE_RETRY_OCR', { captureId: capture.id });
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
    const automatic = isAutomaticBatchNumber(batchNumber);
    const batch = await tx.batch.upsert({
      where: { companyId_productId_batchNumber: { companyId, productId: line.productId!, batchNumber } },
      create: {
        companyId,
        productId: line.productId!,
        batchNumber,
        expiryDate: line.ocrExpiryDate!,
        isAutomatic: automatic,
      },
      // Keep an existing manual flag; mark automatic only when creating.
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
    const internal = doc.type === 'TRANSFER' || doc.type === 'WRITE_OFF';

    for (const line of doc.lines) {
      const productId = line.productId!;
      const batchId = await this.resolveBatch(tx, doc.companyId, line);
      const quantity = toNumber(line.quantity);
      const amounts = this.lineAmounts(line);
      let unitCost: number;
      if (doc.direction === 'IN') {
        unitCost = amounts.finalUnitPrice;
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
            : { finalUnitPrice: amounts.finalUnitPrice, lineTotal: amounts.lineTotal }),
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

  private async assertOpeningBalanceAllowed(user: AuthUser, siteId: string) {
    if (!openingBalanceRoleAllowed(user.role)) {
      throw apiForbidden('OPENING_BALANCE_OWNER_ONLY', 'Only the owner can post opening stock');
    }
    const blockers = await this.prisma.document.findMany({
      where: { companyId: user.companyId, siteId, status: 'POSTED' },
      select: { type: true, number: true },
      take: 40,
    });
    const real = blockers.find((doc) => isRealPostedActivity(doc.type));
    if (real) {
      throw apiBadRequest(
        'OPENING_BALANCE_LOCKED',
        `Opening stock is locked for this site after ${real.number} was posted`,
        { documentNumber: real.number, documentType: real.type },
      );
    }
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
      throw apiBadRequest('DOCUMENT_NOT_EDITABLE', 'Posted or cancelled documents cannot be edited');
    }
  }

  private requireQuantity(dto: { quantity?: number; qty?: number }, product?: { name: string; unit: string } | null) {
    try {
      const quantity = lineQuantity(dto);
      if (quantity < 0.001) throw new BadRequestException('quantity must be greater than 0');
      if (product) this.assertQuantityPrecision(quantity, product);
      return quantity;
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException('quantity is required');
    }
  }

  private assertQuantityPrecision(quantity: number, product: { name: string; unit: string }) {
    const problem = quantityPrecisionProblem(quantity, product.unit, product.name);
    if (problem) throw new BadRequestException(problem);
  }

  private assertBatchFields(
    product: { name: string; batchTracking: boolean },
    batchNumber?: string | null,
    expiryDate?: string | null,
  ) {
    if (!product.batchTracking) return;
    // SKL-15: batch may be empty when expiry is set — we auto-generate A-YYYYMMDD-NN.
    if (!expiryDate && !batchNumber?.trim()) {
      throw apiBadRequest(
        'BATCH_FIELDS_REQUIRED',
        `За „${product.name}“ са нужни партиден номер и срок на годност (или само срок — бутон „Авто“)`,
        { product: product.name },
      );
    }
    if (!expiryDate) {
      throw apiBadRequest('BATCH_EXPIRY_REQUIRED', `За „${product.name}“ е нужен срок на годност`, { product: product.name });
    }
  }

  /** Resolve batch: use typed value, or auto-generate when expiry is present and batch empty (SKL-15). */
  private async resolveBatchNumber(
    tx: Prisma.TransactionClient,
    args: {
      companyId: string;
      siteId: string;
      productId: string;
      batchTracking: boolean;
      batchNumber?: string | null;
      expiryDate?: string | null;
    },
  ): Promise<{ batchNumber: string | null; automatic: boolean }> {
    if (!args.batchTracking) return { batchNumber: null, automatic: false };
    const typed = args.batchNumber?.trim() || '';
    if (typed) return { batchNumber: typed, automatic: isAutomaticBatchNumber(typed) };
    if (!args.expiryDate) return { batchNumber: null, automatic: false };
    const generated = await nextAutomaticBatchNumber(tx, {
      companyId: args.companyId,
      productId: args.productId,
      siteId: args.siteId,
      expiryDate: args.expiryDate,
    });
    return { batchNumber: generated, automatic: true };
  }

  /** Preview next automatic batch for the UI "Авто" button (SKL-15). */
  async suggestAutoBatch(
    user: AuthUser,
    documentId: string,
    input: { productId: string; expiryDate: string },
  ) {
    const doc = await this.findInCompany(user, documentId, true);
    assertDocumentWriteAccess(user, 'edit', doc);
    const product = await this.assertProduct(user.companyId, input.productId);
    if (!product.batchTracking) {
      throw apiBadRequest('BATCH_NOT_TRACKED', 'Продуктът не се следи по партиди');
    }
    const expiry = input.expiryDate?.trim();
    if (!expiry) {
      throw apiBadRequest('BATCH_EXPIRY_REQUIRED', 'Въведете срок на годност преди автоматична партида');
    }
    const batchNumber = await nextAutomaticBatchNumber(this.prisma, {
      companyId: user.companyId,
      productId: product.id,
      siteId: doc.siteId,
      expiryDate: expiry,
    });
    return { batchNumber, expiryDate: expiry, isAutomatic: true };
  }

  private assertWriteOffReason(type: DocumentType, reason: string | null) {
    if (type === 'WRITE_OFF' && !reason) throw new BadRequestException('Choose the reason for the write-off');
    if (type !== 'WRITE_OFF' && reason) throw new BadRequestException('A write-off reason is only allowed on a write-off');
  }

  /** Printed totals and payment terms belong to paper from a supplier or customer, not to internal documents. */
  private assertPrintedFields(type: DocumentType, dto: PrintedInput) {
    if (isPaperDocumentType(type)) return;
    const sent = [dto.printedTaxableBase, dto.printedVatAmount, dto.printedTotal, dto.paymentMethod];
    if (sent.some((value) => value !== undefined && value !== null)) {
      throw new BadRequestException('Printed totals and payment method only apply to supplier and customer paperwork');
    }
  }

  private printedData(dto: PrintedInput) {
    return {
      ...(dto.printedTaxableBase !== undefined ? { printedTaxableBase: dto.printedTaxableBase } : {}),
      ...(dto.printedVatAmount !== undefined ? { printedVatAmount: dto.printedVatAmount } : {}),
      ...(dto.printedTotal !== undefined ? { printedTotal: dto.printedTotal } : {}),
      ...(dto.paymentMethod !== undefined ? { paymentMethod: dto.paymentMethod } : {}),
    };
  }

  private duplicateKey(doc: DocumentRow): DuplicateKey {
    return { companyId: doc.companyId, partnerId: doc.partnerId, type: doc.type, number: doc.number, excludeId: doc.id };
  }

  private async assertNotDuplicate(tx: Prisma.TransactionClient, key: DuplicateKey) {
    const duplicate = await findDuplicateDocument(tx, key);
    if (duplicate) this.throwDuplicate(duplicate);
  }

  private duplicateRef(duplicate: DuplicateDocument) {
    return {
      id: duplicate.id,
      number: duplicate.number,
      type: duplicate.type,
      status: duplicate.status,
      issuedOn: isoDate(duplicate.issuedOn),
      partnerName: duplicate.partner?.name ?? null,
    };
  }

  private duplicateMessage(duplicate: DuplicateDocument) {
    const from = duplicate.partner ? ` from ${duplicate.partner.name}` : '';
    return (
      `${DOCUMENT_TYPE_LABELS[duplicate.type]} № ${duplicate.number}${from} already exists ` +
      `(${duplicate.status.toLowerCase()}, dated ${isoDate(duplicate.issuedOn)})`
    );
  }

  /** 409 with a link target, so the screen can open the document that already has this number. */
  private throwDuplicate(duplicate: DuplicateDocument): never {
    throw new ConflictException({
      statusCode: 409,
      error: 'Conflict',
      code: 'DUPLICATE_DOCUMENT',
      message: this.duplicateMessage(duplicate),
      existingDocument: this.duplicateRef(duplicate),
    });
  }

  /** Stored amounts are ignored here: whatever was saved, the line is worth qty × price × (1 − discount). */
  private lineAmounts(line: LineRow) {
    return computeLineAmounts(toNumber(line.quantity), toNumber(line.unitPrice), toNumber(line.discountPercent));
  }

  /** Printed vs calculated, for supplier and customer paperwork. Internal documents have nothing printed. */
  private totalsCheck(doc: DocumentRow): TotalsCheck | null {
    if (!isPaperDocumentType(doc.type)) return null;
    const printed = (value: Prisma.Decimal | null) => (value === null ? null : toNumber(value));
    return reconcileTotals({
      type: doc.type,
      calculated: documentTotals(doc.lines.map((line) => ({ net: this.lineAmounts(line).lineTotal, rate: toNumber(line.vatRate) }))),
      printed: { taxableBase: printed(doc.printedTaxableBase), vat: printed(doc.printedVatAmount), total: printed(doc.printedTotal) },
      lineCount: doc.lines.length,
    });
  }

  /** A misread or mistyped ЕИК / VAT number would go into the VAT ledgers, so paperwork waits until it is fixed. */
  private partnerMasterDataIssues(doc: DocumentRow, forStaff: boolean): LifecycleIssue[] {
    if (!doc.partner || !isPaperDocumentType(doc.type)) return [];
    // SKL-08: block post only (blockPost). Staff: never link to /settings; managers: Настройки → Партньори.
    const contact = forStaff
      ? 'Свържете се с мениджър.'
      : 'Отворете Настройки → Партньори, за да коригирате данните.';
    const issues: LifecycleIssue[] = taxIdProblems(doc.partner).map((problem) => ({
      code: problem.code,
      message: `${taxIdProblemMessage(problem, `Партньор ${doc.partner!.name}`)}. ${contact}`,
      params: { partner: doc.partner!.name, value: problem.value },
    }));
    if (!doc.partner.verified) {
      issues.push({
        code: 'PARTNER_UNVERIFIED',
        message: `Партньор „${doc.partner.name}“ е непроверен (потвърден от сканиране без съвпадение). ${contact}`,
        params: { partner: doc.partner.name },
      });
    }
    // CAF-06: the ЕИК printed on the invoice is not the one on the partner card.
    const mismatch = eikMismatchFromCaptures(doc.captures);
    if (mismatch) {
      issues.push({
        code: 'EIK_MISMATCH',
        message:
          `ЕИК ${mismatch.extracted} от фактурата не съвпада със записания ЕИК ${mismatch.partner} на партньор „${mismatch.partnerName}“. ${contact}`,
        params: { partner: mismatch.partnerName, extracted: mismatch.extracted, recorded: mismatch.partner },
      });
    }
    return issues;
  }

  private async postingChecks(doc: DocumentRow, user?: AuthUser): Promise<PostingChecks> {
    const today = businessDate();
    const issuedOn = isoDate(doc.issuedOn);
    const totals = this.totalsCheck(doc);
    const forStaff = Boolean(user && !isDocumentManager(user.role));
    const [expiry, duplicate] = await Promise.all([
      this.expiryCheck(doc),
      findDuplicateDocument(this.prisma, this.duplicateKey(doc)),
    ]);

    const lifecycle = classifyDocumentLifecycle(
      {
        type: doc.type,
        direction: doc.direction,
        siteId: doc.siteId,
        targetSiteId: doc.targetSiteId,
        number: doc.number,
        issuedOn,
        partnerId: doc.partnerId,
        totals,
        lines: doc.lines,
        masterDataIssues: this.partnerMasterDataIssues(doc, forStaff),
        scanFirstLineNumber: doc.scanFirstLineNumber,
        amountInWordsParsed: doc.amountInWordsParsed === null ? null : toNumber(doc.amountInWordsParsed),
      },
      today,
      { forStaff },
    );

    const precision = this.quantityPrecisionErrors(doc).map((message) => ({
      code: 'QUANTITY_PRECISION',
      message,
    }));
    const blockPost = [...lifecycle.blockPost, ...precision];
    if (duplicate) {
      blockPost.push({ code: 'DUPLICATE_DOCUMENT', message: this.duplicateMessage(duplicate) });
    }

    const dateConfirmations = lifecycleMessages(lifecycle.needsConfirm);
    const blockBothMessages = lifecycleMessages(lifecycle.blockBoth);
    const blockPostMessages = lifecycleMessages(blockPost);

    return {
      // Post requires no blockBoth and no blockPost (duplicates, pending products, totals, …).
      errors: [...blockBothMessages, ...blockPostMessages],
      reviewWarnings: blockPostMessages,
      canSubmit: lifecycle.blockBoth.length === 0,
      expired: expiry.warnings,
      expiredLineIds: expiry.expiredLineIds,
      dateWarning: dateConfirmations[0] ?? null,
      dateConfirmations,
      duplicate,
      totals,
    };
  }

  private quantityPrecisionErrors(doc: DocumentRow) {
    return doc.lines.flatMap((line) => {
      if (!line.product) return [];
      if (doc.type === 'STOCKTAKE') {
        if (line.countedQuantity === null || line.countedQuantity === undefined) return [];
        const problem = quantityPrecisionProblem(toNumber(line.countedQuantity), line.product.unit, line.product.name);
        return problem ? [problem] : [];
      }
      const problem = quantityPrecisionProblem(toNumber(line.quantity), line.product.unit, line.product.name);
      return problem ? [problem] : [];
    });
  }

  private serializeHeader(
    doc: {
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
      reversalOf: DocumentRow['reversalOf'];
      reversedBy: DocumentRow['reversedBy'];
    },
    role: AuthUser['role'],
  ) {
    const partner = doc.partner
      ? seesFinancials(role)
        ? doc.partner
        : { id: doc.partner.id, name: doc.partner.name, kind: doc.partner.kind }
      : doc.partner;
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
      partner,
      site: doc.site,
      targetSite: doc.targetSite,
      reversalOf: doc.reversalOf && { id: doc.reversalOf.id, documentNumber: doc.reversalOf.number, issuedOn: isoDate(doc.reversalOf.issuedOn) },
      reversedBy: doc.reversedBy && {
        id: doc.reversedBy.id,
        documentNumber: doc.reversedBy.number,
        issuedOn: isoDate(doc.reversedBy.issuedOn),
        reason: doc.reversedBy.notes,
        by: doc.reversedBy.createdBy?.name ?? null,
      },
      reversible: doc.status === 'POSTED' && !doc.reversalOf && !doc.reversedBy && !isTillDocumentType(doc.type),
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

  /**
   * Expiry comes from the stored batch when it exists: the line's date is only what was typed or read,
   * and posting keeps an existing batch's expiry.
   */
  private async expiryCheck(doc: DocumentRow) {
    const issuedOn = isoDate(doc.issuedOn);
    const header = { type: doc.type, direction: doc.direction, issuedOn };
    const none = { warnings: [] as string[], expiredLineIds: new Set<string>() };
    if (!expiryGuarded(header)) return none;
    const tracked = (line: LineRow) => Boolean(line.product?.batchTracking && line.ocrBatchNumber?.trim());
    const dated = doc.lines.filter((line) => line.productId && line.product && (tracked(line) || line.ocrExpiryDate));
    if (dated.length === 0) return none;
    const lookup = dated.filter(tracked);
    const batches = lookup.length
      ? await this.prisma.batch.findMany({
          where: {
            companyId: doc.companyId,
            productId: { in: [...new Set(lookup.map((line) => line.productId!))] },
            batchNumber: { in: [...new Set(lookup.map((line) => line.ocrBatchNumber!.trim()))] },
          },
          select: { productId: true, batchNumber: true, expiryDate: true },
        })
      : [];
    const expiryOf = new Map(batches.map((batch) => [`${batch.productId}\u0000${batch.batchNumber}`, batch.expiryDate]));
    const checked = dated.map((line) => {
      const stored = tracked(line) ? expiryOf.get(`${line.productId}\u0000${line.ocrBatchNumber!.trim()}`) : undefined;
      const expiry = stored ?? line.ocrExpiryDate;
      return { lineId: line.id, productName: line.product!.name, batchNumber: line.ocrBatchNumber, expiryDate: expiry ? isoDate(expiry) : null };
    });
    return {
      warnings: expiredBatchWarnings(header, checked),
      expiredLineIds: new Set(checked.filter((row) => isExpiredOn(row.expiryDate, issuedOn)).map((row) => row.lineId)),
    };
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

  private async detail(user: AuthUser, doc: DocumentRow) {
    const writable = WRITABLE.has(doc.status);
    const [shortfalls, checks, preview, suggestions] = await Promise.all([
      doc.direction === 'OUT' && writable && doc.type !== 'STOCKTAKE' ? this.outShortfalls(this.prisma, doc) : [],
      writable ? this.postingChecks(doc, user) : null,
      doc.type === 'STOCKTAKE' && writable ? this.stocktakePreview(doc) : new Map<string, StocktakeLinePreview>(),
      writable ? this.productSuggestions(doc) : new Map<string, ProductSuggestion[]>(),
    ]);
    return presentDocumentDetailForRole(
      user.role,
      this.serializeDetail(user.role, doc, shortfalls, checks, preview, suggestions),
    );
  }

  /** "Did you mean…" for scanned lines that have no product yet or only one a scan made up. */
  private async productSuggestions(doc: DocumentRow) {
    const result = new Map<string, ProductSuggestion[]>();
    const open = doc.lines.filter((line) => line.ocrDescription && (!line.product || line.product.status === 'PENDING_REVIEW'));
    if (!open.length) return result;
    // Include PENDING_REVIEW: create-from-line blocks on those, so the reviewer must see them here.
    const index = new NameIndex(
      await this.prisma.product.findMany({
        where: { companyId: doc.companyId, status: { in: ['ACTIVE', 'PENDING_REVIEW'] } },
        select: { id: true, name: true, code: true, unit: true, vatRate: true, batchTracking: true, status: true },
      }),
      productKey,
    );
    for (const line of open) {
      const name = splitProductText(line.ocrDescription!, line.supplierProductCode).name;
      const hits = name ? index.suggest(name, 5) : [];
      result.set(
        line.id,
        hits.map(({ item, score }) => ({
          id: item.id,
          name: item.name,
          code: item.code,
          unit: item.unit,
          vatRate: toNumber(item.vatRate),
          batchTracking: item.batchTracking,
          status: item.status,
          score: Math.round(score * 100) / 100,
        })),
      );
    }
    return result;
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
    role: AuthUser['role'],
    doc: DocumentRow,
    shortfalls: Awaited<ReturnType<DocumentsService['outShortfalls']>>,
    checks: PostingChecks | null,
    preview: Map<string, StocktakeLinePreview>,
    suggestions: Map<string, ProductSuggestion[]>,
  ) {
    const errors = [
      ...(checks ? checks.errors : canDocumentBePosted(doc).errors),
      ...shortfalls.map(shortfallMessage),
    ];
    const expired = checks?.expired ?? [];
    const dateConfirmations = checks?.dateConfirmations ?? [];
    const dateWarning = checks?.dateWarning ?? null;
    const reviewWarnings = checks?.reviewWarnings ?? [];
    const canSubmit = checks?.canSubmit ?? errors.length === 0;
    const posting = {
      ok: errors.length === 0 && shortfalls.length === 0,
      canSubmit,
      errors,
      reviewWarnings,
      warnings: [...reviewWarnings, ...expired, ...dateConfirmations],
      expired,
      dateWarning,
      confirmExpired: expired.length > 0,
      confirmDate: dateConfirmations.length > 0,
      duplicateOf: checks?.duplicate ? this.duplicateRef(checks.duplicate) : null,
    };
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

    const lines = doc.lines.map((line) => {
      const scanFlags = scanLineChecks({
        printed: line.ocrUnit,
        quantity: toNumber(line.quantity),
        productUnit: line.product?.unit ?? line.unit,
        quantityConfirmed: line.quantityConfirmed,
        unitConfirmed: line.unitConfirmed,
      });
      return {
      id: line.id,
      position: line.position,
      sourceCaptureId: line.sourceCaptureId,
      printed: {
        description: line.ocrDescription,
        supplierCode: line.supplierProductCode,
        barcode: line.ocrBarcode,
        unit: line.ocrUnit,
        /** The printed name without batch, expiry or codes: the default for "Create product". */
        name: line.ocrDescription ? splitProductText(line.ocrDescription, line.supplierProductCode).name || null : null,
      },
      productId: line.productId,
      product: line.product,
      suggestions: suggestions.get(line.id) ?? [],
      quantity: toNumber(line.quantity),
      unitPrice: toNumber(line.unitPrice),
      freeOfCharge: line.freeOfCharge,
      missingPrice: !line.freeOfCharge && !(toNumber(line.unitPrice) > 0),
      discountPercent: toNumber(line.discountPercent),
      finalUnitPrice: line.finalUnitPrice === null ? null : toNumber(line.finalUnitPrice),
      lineTotal: line.lineTotal === null ? null : toNumber(line.lineTotal),
      printedLineTotal: line.ocrLineTotal === null ? null : toNumber(line.ocrLineTotal),
      expired: checks?.expiredLineIds.has(line.id) ?? false,
      vatRate: toNumber(line.vatRate),
      unit: line.unit,
      batchNumber: line.ocrBatchNumber,
      expiryDate: line.ocrExpiryDate ? isoDate(line.ocrExpiryDate) : null,
      quantityCheck: scanFlags.quantityCheck,
      unitCheck: scanFlags.unitCheck,
      // CAF-03: batch and expiry stay on the line even when the product is not tracked.
      batchNotTracked: Boolean(
        line.product && !line.product.batchTracking && (line.ocrBatchNumber?.trim() || line.ocrExpiryDate),
      ),
      batch: line.batch
        ? {
            id: line.batch.id,
            batchNumber: line.batch.batchNumber,
            expiryDate: line.batch.expiryDate ? isoDate(line.batch.expiryDate) : null,
          }
        : null,
      verified: line.verified,
      ...(doc.type === 'STOCKTAKE' ? { stocktake: this.stocktakeLine(line, preview) } : {}),
    };
    });

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
        ...this.serializeHeader(doc, role),
        createdBy: doc.createdBy,
        paymentMethod: doc.paymentMethod,
        totals: checks?.totals ?? this.totalsCheck(doc),
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

  private async log(
    user: AuthUser,
    doc: { id: string; number: string },
    action: string,
    metadata: Record<string, unknown>,
    diff?: { before: Record<string, unknown>; after: Record<string, unknown> } | null,
  ) {
    await recordActivity(this.prisma, user, {
      entityType: 'Document',
      entityId: doc.id,
      action,
      label: doc.number,
      metadata,
      ...(diff ?? {}),
    });
  }
}

/** Printed supplier ЕИК kept on the capture when it differs from the matched partner (CAF-06). */
export function eikMismatchFromCaptures(
  captures: { ocrRaw: Prisma.JsonValue | null }[],
): { extracted: string; partner: string; partnerName: string } | null {
  for (const capture of captures) {
    const raw = capture.ocrRaw;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const mismatch = (raw as { partnerMatch?: { eikMismatch?: { extracted?: unknown; partner?: unknown; partnerName?: unknown } } })
      .partnerMatch?.eikMismatch;
    if (
      mismatch &&
      typeof mismatch.extracted === 'string' &&
      typeof mismatch.partner === 'string' &&
      typeof mismatch.partnerName === 'string'
    ) {
      return { extracted: mismatch.extracted, partner: mismatch.partner, partnerName: mismatch.partnerName };
    }
  }
  return null;
}
