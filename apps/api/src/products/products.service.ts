import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type ProductStatus } from '@prisma/client';
import { canWriteProductCatalog, isOperationalManager, netContentProblem, type AuthUser, type ContentUnit } from '@skladnik/shared';
import { changes, recordActivity } from '../activity/record-activity';
import { apiBadRequest, apiForbidden } from '../common/api-error';
import { toNumber } from '../common/decimal';
import { presentProductForRole } from '../common/staff-view';
import { PrismaService } from '../prisma/prisma.service';
import { adoptLooseStock, UNBATCHED_LOT_NAME } from '../stock/batch-adoption';
import { loadCostBook, saveAverages } from '../stock/ledger';
import { CreateProductDto } from './dto/create-product.dto';
import { CreateSupplierCodeDto } from './dto/create-supplier-code.dto';
import { ListProductsQueryDto } from './dto/list-products-query.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { managerMinStockOnlyPatch } from './product-write-policy';

const productInclude = {
  group: { select: { id: true, name: true } },
  barcodes: { select: { id: true, barcode: true }, orderBy: { barcode: 'asc' as const } },
  supplierCodes: {
    orderBy: { supplierCode: 'asc' as const },
    include: { partner: { select: { id: true, name: true, kind: true } } },
  },
} satisfies Prisma.ProductInclude;

type ProductRow = Prisma.ProductGetPayload<{ include: typeof productInclude }>;

const LOGGED_FIELDS = [
  'name', 'code', 'unit', 'packSize', 'netContent', 'netContentUnit', 'vatRate', 'purchasePrice', 'sellingPrice',
  'minStock', 'maxStock', 'batchTracking', 'status', 'group', 'barcodes',
] as const;

function productSnapshot(product: ProductRow) {
  return {
    name: product.name,
    code: product.code,
    unit: product.unit,
    packSize: product.packSize,
    netContent: product.netContent,
    netContentUnit: product.netContentUnit,
    vatRate: product.vatRate,
    purchasePrice: product.purchasePrice,
    sellingPrice: product.sellingPrice,
    minStock: product.minStock,
    maxStock: product.maxStock,
    batchTracking: product.batchTracking,
    status: product.status,
    group: product.group?.name ?? null,
    barcodes: product.barcodes.map((row) => row.barcode),
  };
}

function resolveNetContent(
  netContent: number | null | undefined,
  netContentUnit: ContentUnit | null | undefined,
): { netContent: number | null; netContentUnit: ContentUnit | null } {
  const problem = netContentProblem(netContent, netContentUnit);
  if (problem) throw new BadRequestException(problem);
  if (netContent == null || netContentUnit == null) return { netContent: null, netContentUnit: null };
  return { netContent, netContentUnit };
}

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(user: AuthUser, query: ListProductsQueryDto) {
    const search = query.q?.trim();
    const products = await this.prisma.product.findMany({
      where: {
        companyId: user.companyId,
        ...(query.groupId ? { groupId: query.groupId } : {}),
        ...(query.status
          ? { status: query.status }
          : { status: { not: 'ARCHIVED' as const } }),
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { code: { contains: search, mode: 'insensitive' } },
                { barcodes: { some: { barcode: { contains: search, mode: 'insensitive' } } } },
              ],
            }
          : {}),
      },
      include: productInclude,
      orderBy: [{ status: 'asc' }, { name: 'asc' }],
    });
    return { products: products.map((product) => this.serialize(product, user.role)) };
  }

  async create(user: AuthUser, dto: CreateProductDto) {
    await this.assertGroup(user.companyId, dto.groupId);
    const barcodes = this.normalizeBarcodes(dto.barcodes);
    await this.assertBarcodesFree(user.companyId, barcodes);
    const net = resolveNetContent(dto.netContent, dto.netContentUnit);

    try {
      const product = await this.prisma.product.create({
        data: {
          companyId: user.companyId,
          name: dto.name.trim(),
          code: dto.code.trim(),
          groupId: dto.groupId ?? null,
          unit: dto.unit,
          packSize: dto.packSize ?? 1,
          netContent: net.netContent,
          netContentUnit: net.netContentUnit,
          vatRate: dto.vatRate,
          purchasePrice: dto.purchasePrice,
          sellingPrice: dto.sellingPrice,
          minStock: dto.minStock ?? 0,
          maxStock: dto.maxStock ?? null,
          batchTracking: dto.batchTracking ?? false,
          status: dto.status === 'ARCHIVED' ? 'ACTIVE' : (dto.status ?? 'ACTIVE'),
          barcodes: {
            create: barcodes.map((barcode) => ({ companyId: user.companyId, barcode })),
          },
        },
        include: productInclude,
      });
      await this.log(user, product, 'CREATE', { after: productSnapshot(product) });
      return { product: this.serialize(product, user.role) };
    } catch (error) {
      this.throwIfCodeTaken(error);
      throw error;
    }
  }

  async update(user: AuthUser, id: string, dto: UpdateProductDto) {
    const existing = await this.findInCompany(user.companyId, id);
    const catalogWriter = canWriteProductCatalog(user.role);
    // CAF-02: a site manager may edit a product that is still waiting for approval.
    const pendingEdit = !catalogWriter && user.role === 'SITE_MANAGER' && existing.status === 'PENDING_REVIEW';
    if (pendingEdit && dto.status === 'ARCHIVED') {
      throw apiForbidden('PRODUCT_CATALOG_FORBIDDEN', 'Архивирането е за собственика. Одобрете продукта или го обединете със съществуващ.');
    }
    if (!catalogWriter && !pendingEdit) {
      // SKL-12: site managers write ProductSiteMin for their own site only (not company Product.minStock).
      const restricted = managerMinStockOnlyPatch(dto as unknown as Record<string, unknown>);
      if (!restricted.ok) {
        throw apiForbidden('PRODUCT_CATALOG_FORBIDDEN', 'Управителят на обект може да променя само минимума за наличност');
      }
      if (restricted.minStock === undefined) {
        throw apiForbidden('PRODUCT_CATALOG_FORBIDDEN', 'Управителят на обект може да променя само минимума за наличност');
      }
      if (!restricted.siteId) {
        throw apiBadRequest('PRODUCT_SITE_MIN_REQUIRED', 'Посочете обект за минимума на наличност');
      }
      if (!user.allSites && !user.siteIds.includes(restricted.siteId)) {
        throw apiForbidden('PRODUCT_SITE_FORBIDDEN', 'Можете да променяте минимума само за своите обекти');
      }
      const site = await this.prisma.site.findFirst({
        where: { id: restricted.siteId, companyId: user.companyId, isActive: true },
        select: { id: true },
      });
      if (!site) throw apiBadRequest('SITE_NOT_FOUND', 'Обектът не е намерен');

      await this.prisma.productSiteMin.upsert({
        where: { productId_siteId: { productId: existing.id, siteId: restricted.siteId } },
        create: {
          companyId: user.companyId,
          productId: existing.id,
          siteId: restricted.siteId,
          minStock: restricted.minStock,
        },
        update: { minStock: restricted.minStock },
      });
      await this.log(user, existing, 'UPDATE', {
        before: { minStock: toNumber(existing.minStock) },
        after: { siteMinStock: restricted.minStock, siteId: restricted.siteId },
      });
      return { product: this.serialize(existing, user.role) };
    }

    if (dto.groupId !== undefined) {
      await this.assertGroup(user.companyId, dto.groupId);
    }

    const data: Prisma.ProductUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.code !== undefined) data.code = dto.code.trim();
    if (dto.unit !== undefined) data.unit = dto.unit;
    if (dto.packSize !== undefined) data.packSize = dto.packSize;
    if (dto.netContent !== undefined || dto.netContentUnit !== undefined) {
      const net = resolveNetContent(
        dto.netContent !== undefined ? dto.netContent : existing.netContent === null ? null : toNumber(existing.netContent),
        dto.netContentUnit !== undefined
          ? dto.netContentUnit
          : (existing.netContentUnit as ContentUnit | null),
      );
      data.netContent = net.netContent;
      data.netContentUnit = net.netContentUnit;
    }
    if (dto.vatRate !== undefined) data.vatRate = dto.vatRate;
    if (dto.purchasePrice !== undefined) data.purchasePrice = dto.purchasePrice;
    if (dto.sellingPrice !== undefined) data.sellingPrice = dto.sellingPrice;
    if (dto.minStock !== undefined) data.minStock = dto.minStock;
    if (dto.maxStock !== undefined) data.maxStock = dto.maxStock;
    if (dto.batchTracking !== undefined) data.batchTracking = dto.batchTracking;
    const enableTracking = dto.batchTracking === true && !existing.batchTracking;
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.groupId !== undefined) {
      data.group = dto.groupId ? { connect: { id: dto.groupId } } : { disconnect: true };
    }

    try {
      const product = await this.prisma.$transaction(async (tx) => {
        if (dto.barcodes) {
          const barcodes = this.normalizeBarcodes(dto.barcodes);
          await this.assertBarcodesFree(user.companyId, barcodes, existing.id, tx);
          await tx.productBarcode.deleteMany({ where: { productId: existing.id } });
          if (barcodes.length > 0) {
            await tx.productBarcode.createMany({
              data: barcodes.map((barcode) => ({
                companyId: user.companyId,
                productId: existing.id,
                barcode,
              })),
            });
          }
        }
        if (enableTracking) await this.moveLooseStockIntoUnbatchedLot(tx, user.companyId, existing.id);
        // Owner/accountant may also set a per-site override when siteId is supplied.
        if (dto.siteId !== undefined && dto.minStock !== undefined) {
          await tx.productSiteMin.upsert({
            where: { productId_siteId: { productId: existing.id, siteId: dto.siteId } },
            create: {
              companyId: user.companyId,
              productId: existing.id,
              siteId: dto.siteId,
              minStock: dto.minStock,
            },
            update: { minStock: dto.minStock },
          });
        }
        return tx.product.update({
          where: { id: existing.id },
          data,
          include: productInclude,
        });
      });
      const diff = changes(productSnapshot(existing), productSnapshot(product), LOGGED_FIELDS);
      if (diff) await this.log(user, product, 'UPDATE', diff);
      return { product: this.serialize(product, user.role) };
    } catch (error) {
      this.throwIfCodeTaken(error);
      throw error;
    }
  }

  /**
   * CAF-03: one-click for a manager. Existing loose stock moves into „без партида“
   * (no expiry) so the on-hand total does not change. Line batch and expiry are untouched.
   */
  async enableBatchTracking(user: AuthUser, id: string) {
    if (!isOperationalManager(user.role)) {
      throw apiForbidden('INSUFFICIENT_ROLE', 'Нямате права за това действие');
    }
    const existing = await this.findInCompany(user.companyId, id);
    if (existing.batchTracking) return { product: this.serialize(existing, user.role) };
    const product = await this.prisma.$transaction(async (tx) => {
      await this.moveLooseStockIntoUnbatchedLot(tx, user.companyId, existing.id);
      return tx.product.update({
        where: { id: existing.id },
        data: { batchTracking: true },
        include: productInclude,
      });
    });
    await this.log(user, product, 'UPDATE', { before: { batchTracking: false }, after: { batchTracking: true } });
    return { product: this.serialize(product, user.role) };
  }

  /**
   * CAF-02: move document lines off a pending product onto an existing one, then drop the pending row.
   * Stock movements are not rewritten; a pending product cannot have been posted.
   */
  async mergePending(user: AuthUser, id: string, intoProductId: string) {
    if (!isOperationalManager(user.role)) {
      throw apiForbidden('INSUFFICIENT_ROLE', 'Нямате права за това действие');
    }
    if (!intoProductId) throw apiBadRequest('PRODUCT_MERGE_TARGET', 'Изберете съществуващ продукт');
    if (id === intoProductId) throw apiBadRequest('PRODUCT_MERGE_SELF', 'Изберете друг продукт, с който да обедините');
    const pending = await this.findInCompany(user.companyId, id);
    if (pending.status !== 'PENDING_REVIEW') {
      throw apiBadRequest('PRODUCT_NOT_PENDING', 'Само продукт за одобрение може да се обедини със съществуващ');
    }
    const target = await this.findInCompany(user.companyId, intoProductId);
    if (target.status === 'ARCHIVED') throw apiBadRequest('PRODUCT_ARCHIVED', 'Архивиран продукт не може да поеме редовете');

    await this.prisma.$transaction(async (tx) => {
      await tx.documentLine.updateMany({
        where: { companyId: user.companyId, productId: pending.id },
        data: { productId: target.id, unit: target.unit },
      });
      const movements = await tx.stockMovement.count({ where: { productId: pending.id } });
      if (movements === 0) {
        await tx.recipeIngredient.deleteMany({ where: { productId: pending.id } });
        await tx.batch.deleteMany({ where: { productId: pending.id } });
        await tx.product.delete({ where: { id: pending.id } });
      } else {
        await tx.product.update({ where: { id: pending.id }, data: { status: 'ARCHIVED' } });
      }
    });
    await this.log(user, target, 'MERGE', {
      before: {},
      after: { mergedFrom: pending.name, mergedFromCode: pending.code },
    });
    return { productId: target.id };
  }

  /**
   * CAF-03: OUT the loose quantity and IN the same quantity into one lot with no expiry.
   * See adoptLooseStock — on-hand before equals on-hand after.
   */
  private async moveLooseStockIntoUnbatchedLot(tx: Prisma.TransactionClient, companyId: string, productId: string) {
    const sites = await tx.site.findMany({ where: { companyId }, select: { id: true } });
    for (const site of sites) {
      const { book } = await loadCostBook(tx, companyId, site.id, [productId]);
      const plan = adoptLooseStock(book.onHand(productId, null));
      if (!plan) continue;
      const batch = await tx.batch.upsert({
        where: { companyId_productId_batchNumber: { companyId, productId, batchNumber: UNBATCHED_LOT_NAME } },
        create: { companyId, productId, batchNumber: UNBATCHED_LOT_NAME, expiryDate: null, isAutomatic: false },
        update: {},
      });
      const unitCost = book.issue(productId, null, plan.outQty);
      book.receive(productId, batch.id, plan.inQty, unitCost);
      await tx.stockMovement.create({
        data: {
          companyId,
          siteId: site.id,
          productId,
          batchId: null,
          direction: 'OUT',
          quantity: plan.outQty,
          unitCost,
        },
      });
      await tx.stockMovement.create({
        data: {
          companyId,
          siteId: site.id,
          productId,
          batchId: batch.id,
          direction: 'IN',
          quantity: plan.inQty,
          unitCost,
        },
      });
      await saveAverages(tx, companyId, site.id, book);
    }
  }

  async archive(user: AuthUser, id: string) {
    if (!canWriteProductCatalog(user.role)) {
      throw apiForbidden('PRODUCT_CATALOG_FORBIDDEN', 'Само собственикът може да архивира продукти');
    }
    const existing = await this.findInCompany(user.companyId, id);
    if (existing.status === 'ARCHIVED') {
      return { product: this.serialize(existing, user.role) };
    }
    const product = await this.prisma.product.update({
      where: { id: existing.id },
      data: { status: 'ARCHIVED' },
      include: productInclude,
    });
    await this.log(user, product, 'ARCHIVE', { before: { status: existing.status }, after: { status: product.status } });
    return { product: this.serialize(product, user.role) };
  }

  async addSupplierCode(user: AuthUser, productId: string, dto: CreateSupplierCodeDto) {
    const product = await this.findInCompany(user.companyId, productId);
    const partner = await this.prisma.partner.findFirst({
      where: { id: dto.partnerId, companyId: user.companyId },
    });
    if (!partner) {
      throw new NotFoundException('Partner not found');
    }
    if (partner.kind === 'CUSTOMER') {
      throw new BadRequestException('Supplier codes can only be attached to a supplier');
    }

    try {
      const mapping = await this.prisma.supplierProductCode.create({
        data: {
          companyId: user.companyId,
          productId: product.id,
          partnerId: partner.id,
          supplierCode: dto.supplierCode.trim(),
        },
        include: { partner: { select: { id: true, name: true, kind: true } } },
      });
      await this.log(user, product, 'SUPPLIER_CODE', {
        after: { supplier: partner.name, supplierCode: mapping.supplierCode },
      });
      return {
        mapping: {
          id: mapping.id,
          supplierCode: mapping.supplierCode,
          partner: mapping.partner,
        },
      };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('This supplier already uses that product code');
      }
      throw error;
    }
  }

  async removeSupplierCode(user: AuthUser, productId: string, mappingId: string) {
    const product = await this.findInCompany(user.companyId, productId);
    const mapping = await this.prisma.supplierProductCode.findFirst({
      where: { id: mappingId, productId: product.id, companyId: user.companyId },
    });
    if (!mapping) {
      throw new NotFoundException('Supplier code not found');
    }
    await this.prisma.supplierProductCode.delete({ where: { id: mapping.id } });
    await this.log(user, product, 'SUPPLIER_CODE_DELETE', { before: { supplierCode: mapping.supplierCode } });
    return { ok: true };
  }

  private async findInCompany(companyId: string, id: string) {
    const product = await this.prisma.product.findFirst({
      where: { id, companyId },
      include: productInclude,
    });
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    return product;
  }

  private async assertGroup(companyId: string, groupId?: string | null) {
    if (!groupId) return;
    const group = await this.prisma.productGroup.findFirst({
      where: { id: groupId, companyId },
      select: { id: true },
    });
    if (!group) {
      throw new NotFoundException('Product group not found');
    }
  }

  private normalizeBarcodes(barcodes?: string[]) {
    return [...new Set((barcodes ?? []).map((barcode) => barcode.trim()).filter(Boolean))];
  }

  private async assertBarcodesFree(
    companyId: string,
    barcodes: string[],
    productId?: string,
    db: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    if (barcodes.length === 0) return;
    const clash = await db.productBarcode.findFirst({
      where: {
        companyId,
        barcode: { in: barcodes },
        ...(productId ? { productId: { not: productId } } : {}),
      },
      select: { barcode: true },
    });
    if (clash) {
      throw new ConflictException(`Barcode ${clash.barcode} is already in use`);
    }
  }

  private throwIfCodeTaken(error: unknown): never | void {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictException('A product with this code already exists');
    }
  }

  private serialize(product: ProductRow, role: AuthUser['role']) {
    return presentProductForRole(role, {
      id: product.id,
      name: product.name,
      code: product.code,
      unit: product.unit,
      packSize: toNumber(product.packSize),
      netContent: product.netContent === null ? null : toNumber(product.netContent),
      netContentUnit: product.netContentUnit as ContentUnit | null,
      vatRate: toNumber(product.vatRate),
      purchasePrice: toNumber(product.purchasePrice),
      sellingPrice: product.sellingPrice === null ? null : toNumber(product.sellingPrice),
      minStock: toNumber(product.minStock),
      maxStock: product.maxStock === null ? null : toNumber(product.maxStock),
      batchTracking: product.batchTracking,
      status: product.status as ProductStatus,
      group: product.group,
      barcodes: product.barcodes,
      supplierCodes: product.supplierCodes.map((row) => ({
        id: row.id,
        supplierCode: row.supplierCode,
        partner: row.partner,
      })),
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
    });
  }

  private async log(
    user: AuthUser,
    product: { id: string; name: string },
    action: string,
    diff: { before?: Record<string, unknown>; after?: Record<string, unknown> },
  ) {
    await recordActivity(this.prisma, user, {
      entityType: 'Product',
      entityId: product.id,
      label: product.name,
      action,
      ...diff,
    });
  }
}
