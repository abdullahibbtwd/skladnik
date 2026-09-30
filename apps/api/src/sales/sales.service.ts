import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  canOverridePrice,
  grossQuantity,
  ingredientIssue,
  isBelowCost,
  isSalesManager,
  quantityPrecisionProblem,
  recipeQtyToStock,
  recipeUnitProblem,
  type AuthUser,
  type ContentUnit,
  type PaymentMethod,
} from '@skladnik/shared';
import { recordActivity } from '../activity/record-activity';
import { apiBadRequest } from '../common/api-error';
import { toNumber } from '../common/decimal';
import { PrismaService } from '../prisma/prisma.service';
import { loadCostBook, lockSites, saveAverages } from '../stock/ledger';
import { addDays, businessDate, businessHour, businessRange, daysBetween, isBusinessDate } from './business-day';
import type { CreateSaleDto, MarginsQueryDto, SalesListQueryDto, SalesReportQueryDto, VoidSaleDto } from './dto/sales.dto';
import { allocateSaleLine, shortfallMessage, type StockShortfall } from './fefo';
import { marginRows, summarizeSales, type MarginGrouping, type ReportDocument } from './sales-report';

const MAX_REPORT_DAYS = 366;

const round2 = (value: number) => Math.round(value * 100) / 100;
const round4 = (value: number) => Math.round(value * 10000) / 10000;
const isoDate = (value: Date) => value.toISOString().slice(0, 10);
const dateOnly = (value: string) => new Date(`${value}T00:00:00Z`);

type SaleMovementDraft = { productId: string; batchId: string | null; quantity: number; unitCost: number };

/** One receipt line. A stocked product has one movement (its batch); a dish has one per ingredient batch issued. */
type SaleLineDraft = {
  productId: string;
  unit: Prisma.DocumentLineCreateManyInput['unit'];
  batchId: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  vatRate: Prisma.Decimal;
  movements: SaleMovementDraft[];
};

/** Cost fields are for managers only; staff see what was sold, not what it cost. */
function withoutCost<T extends Record<string, unknown>>(row: T) {
  const { cost: _cost, profit: _profit, marginPercent: _margin, linesWithoutCost: _missing, ...rest } = row;
  return rest;
}

@Injectable()
export class SalesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Records a till sale in one transaction: price check, FEFO batch allocation, stock check under the
   * site lock, then a posted SALE document with one OUT movement per allocated batch at its cost.
   * `at` is for seed/backfill only — FEFO and timestamps use that instant instead of now.
   */
  async create(user: AuthUser, dto: CreateSaleDto, options: { at?: Date } = {}) {
    if (dto.clientRequestId) {
      const existing = await this.findByRequest(user.companyId, dto.clientRequestId);
      if (existing) return this.receipt(user, existing);
    }

    const productIds = [...new Set(dto.items.map((item) => item.productId))];
    const products = await this.prisma.product.findMany({
      where: { companyId: user.companyId, id: { in: productIds } },
      select: {
        id: true,
        name: true,
        unit: true,
        vatRate: true,
        sellingPrice: true,
        batchTracking: true,
        status: true,
        recipe: {
          select: {
            yieldPortions: true,
            ingredients: {
              orderBy: { position: 'asc' },
              select: {
                quantity: true,
                quantityUnit: true,
                wastagePercent: true,
                product: {
                  select: {
                    id: true,
                    name: true,
                    batchTracking: true,
                    unit: true,
                    netContent: true,
                    netContentUnit: true,
                  },
                },
              },
            },
          },
        },
      },
    });
    const productById = new Map(products.map((product) => [product.id, product]));
    const company = await this.prisma.company.findUniqueOrThrow({
      where: { id: user.companyId },
      select: { priceOverrideRoles: true },
    });
    const mayOverride = canOverridePrice(user.role, company.priceOverrideRoles);
    const priced = dto.items.map((item, index) => {
      const product = productById.get(item.productId);
      if (!product) throw new NotFoundException('Product not found');
      if (product.status === 'ARCHIVED') throw new BadRequestException(`${product.name} is archived`);
      const precision = quantityPrecisionProblem(item.quantity, product.unit, product.name);
      if (precision) throw new BadRequestException(precision);
      const listPrice = toNumber(product.sellingPrice);
      const overridden = item.unitPrice !== undefined && round4(item.unitPrice) !== round4(listPrice);
      if (overridden && !mayOverride) {
        throw new ForbiddenException('Your role cannot change prices at the till. Ask the owner to allow it in Settings → Stock rules.');
      }
      if (item.unitPrice === undefined && listPrice <= 0) {
        throw new BadRequestException(`${product.name} has no selling price yet`);
      }
      if (item.batchId && product.recipe) {
        throw new BadRequestException(`${product.name} is made to order; its ingredients are picked automatically`);
      }
      if (item.batchId && !product.batchTracking) {
        throw new BadRequestException(`${product.name} is not tracked by batch`);
      }
      return { index, item, product, listPrice, overridden, unitPrice: round4(item.unitPrice ?? listPrice) };
    });
    const stockIds = [
      ...new Set(
        products.flatMap((product) =>
          product.recipe ? product.recipe.ingredients.map((row) => row.product.id) : [product.id],
        ),
      ),
    ];

    const now = options.at ?? new Date();
    const today = businessDate(now);
    let sale: {
      id: string;
      number: string;
      total: number;
      expired: string[];
      overrides: { productId: string; product: string; listPrice: number; unitPrice: number; unitCost: number | null; belowCost: boolean }[];
    };
    try {
      sale = await this.prisma.$transaction(
        async (tx) => {
          await lockSites(tx, [dto.siteId]);
          const [{ book }, batchRows] = await Promise.all([
            loadCostBook(tx, user.companyId, dto.siteId, stockIds),
            tx.batch.findMany({
              where: { companyId: user.companyId, productId: { in: stockIds } },
              select: { id: true, productId: true, batchNumber: true, expiryDate: true },
            }),
          ]);

          const shortfalls: StockShortfall[] = [];
          const expired = new Set<string>();
          const lines: SaleLineDraft[] = [];
          const itemOfLine: number[] = [];
          // Each allocation reads the book after the previous line's issues, so a cart can't oversell.
          const allocate = (stock: { id: string; name: string; batchTracking: boolean }, quantity: number, batchId?: string) => {
            const result = allocateSaleLine(
              {
                productName: stock.name,
                batchTracking: stock.batchTracking,
                quantity,
                batchId,
                onHand: book.onHand(stock.id),
                batches: batchRows
                  .filter((batch) => batch.productId === stock.id)
                  .map((batch) => ({
                    batchId: batch.id,
                    batchNumber: batch.batchNumber,
                    expiryDate: batch.expiryDate ? isoDate(batch.expiryDate) : null,
                    onHand: book.onHand(stock.id, batch.id),
                  })),
              },
              today,
            );
            if (result.shortfall) {
              shortfalls.push(result.shortfall);
              return null;
            }
            result.expired.forEach((message) => expired.add(message));
            return result.allocations.map((allocation) => ({
              productId: stock.id,
              batchId: allocation.batchId,
              quantity: allocation.quantity,
              unitCost: book.issue(stock.id, allocation.batchId, allocation.quantity),
            }));
          };

          for (const { index, item, product, unitPrice } of priced) {
            if (product.recipe) {
              const yieldPortions = toNumber(product.recipe.yieldPortions);
              const movements: SaleMovementDraft[] = [];
              for (const ingredient of product.recipe.ingredients) {
                const content = {
                  unit: ingredient.product.unit,
                  netContent: ingredient.product.netContent === null ? null : toNumber(ingredient.product.netContent),
                  netContentUnit: ingredient.product.netContentUnit as ContentUnit | null,
                };
                const stockQty = recipeQtyToStock(
                  toNumber(ingredient.quantity),
                  ingredient.quantityUnit as ContentUnit | null,
                  content,
                );
                if (stockQty == null) {
                  throw new BadRequestException(
                    recipeUnitProblem(ingredient.quantityUnit as ContentUnit | null, content, ingredient.product.name) ??
                      `${ingredient.product.name}: cannot convert recipe quantity`,
                  );
                }
                const gross = grossQuantity(stockQty, toNumber(ingredient.wastagePercent));
                const quantity = ingredientIssue(gross, yieldPortions, item.quantity);
                if (quantity <= 0) continue;
                const issued = allocate(
                  { ...ingredient.product, name: `${ingredient.product.name} (for ${product.name})` },
                  quantity,
                );
                if (issued) movements.push(...issued);
              }
              itemOfLine.push(index);
              lines.push({
                productId: product.id,
                unit: product.unit,
                batchId: null,
                quantity: item.quantity,
                unitPrice,
                lineTotal: round2(item.quantity * unitPrice),
                vatRate: product.vatRate,
                movements,
              });
              continue;
            }
            for (const movement of allocate(product, item.quantity, item.batchId) ?? []) {
              itemOfLine.push(index);
              lines.push({
                productId: product.id,
                unit: product.unit,
                batchId: movement.batchId,
                quantity: movement.quantity,
                unitPrice,
                lineTotal: round2(movement.quantity * unitPrice),
                vatRate: product.vatRate,
                movements: [movement],
              });
            }
          }
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
          if (expired.size && !dto.confirmExpired) {
            const warnings = [...expired];
            throw new BadRequestException({
              statusCode: 400,
              error: 'Bad Request',
              code: 'EXPIRED_CONFIRM',
              message: `${warnings.join('. ')}. Confirm to sell expired stock.`,
              warnings,
            });
          }

          const overrides = priced
            .filter((row) => row.overridden)
            .map((row) => {
              const issued = lines
                .filter((_, position) => itemOfLine[position] === row.index)
                .flatMap((line) => line.movements);
              const costed = issued.length > 0 && issued.every((movement) => movement.unitCost > 0);
              const unitCost = costed
                ? round4(issued.reduce((sum, movement) => sum + movement.quantity * movement.unitCost, 0) / row.item.quantity)
                : null;
              return {
                productId: row.product.id,
                product: row.product.name,
                listPrice: row.listPrice,
                unitPrice: row.unitPrice,
                unitCost,
                belowCost: isBelowCost(row.unitPrice, toNumber(row.product.vatRate), unitCost),
              };
            });
          const belowCost = overrides.filter((row) => row.belowCost);
          if (belowCost.length && !dto.confirmBelowCost) {
            const warnings = belowCost.map(
              (row) => `${row.product}: ${row.unitPrice.toFixed(2)} is below its cost of ${row.unitCost!.toFixed(2)} (before VAT)`,
            );
            throw new BadRequestException({
              statusCode: 400,
              error: 'Bad Request',
              code: 'BELOW_COST_CONFIRM',
              message: `${warnings.join('. ')}. Confirm to sell below cost.`,
              warnings,
            });
          }

          const number = await this.nextSaleNumber(tx, user.companyId, today);
          const created = await tx.document.create({
            data: {
              companyId: user.companyId,
              siteId: dto.siteId,
              type: 'SALE',
              status: 'POSTED',
              direction: 'OUT',
              number,
              issuedOn: dateOnly(today),
              postedAt: now,
              paymentMethod: dto.paymentMethod,
              paymentReference: dto.paymentReference ?? null,
              createdById: user.id,
              clientRequestId: dto.clientRequestId ?? null,
              lines: {
                create: lines.map((line, position) => ({
                  companyId: user.companyId,
                  position,
                  productId: line.productId,
                  batchId: line.batchId,
                  unit: line.unit,
                  quantity: line.quantity,
                  unitPrice: line.unitPrice,
                  discountPercent: 0,
                  finalUnitPrice: line.unitPrice,
                  lineTotal: line.lineTotal,
                  vatRate: line.vatRate,
                })),
              },
            },
            select: { id: true, lines: { select: { id: true, position: true } } },
          });
          const lineIdByPosition = new Map(created.lines.map((line) => [line.position, line.id]));
          await tx.stockMovement.createMany({
            data: lines.flatMap((line, position) =>
              line.movements.map((movement) => ({
                companyId: user.companyId,
                siteId: dto.siteId,
                documentId: created.id,
                documentLineId: lineIdByPosition.get(position)!,
                productId: movement.productId,
                batchId: movement.batchId,
                direction: 'OUT' as const,
                quantity: movement.quantity,
                unitCost: movement.unitCost,
                occurredAt: now,
              })),
            ),
          });
          return {
            id: created.id,
            number,
            total: round2(lines.reduce((sum, line) => sum + line.lineTotal, 0)),
            expired: [...expired],
            overrides,
          };
        },
        { timeout: 30_000 },
      );
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const existing = dto.clientRequestId ? await this.findByRequest(user.companyId, dto.clientRequestId) : null;
        if (existing) return this.receipt(user, existing);
        throw new ConflictException('Another sale took the same number. Please try again.');
      }
      throw error;
    }

    await this.log(user, sale, 'SALE', {
      metadata: {
        total: sale.total,
        paymentMethod: dto.paymentMethod,
        ...(sale.expired.length ? { confirmedExpired: sale.expired } : {}),
      },
    });
    for (const { listPrice, unitPrice, ...override } of sale.overrides) {
      await this.log(user, sale, 'PRICE_OVERRIDE', {
        before: { unitPrice: listPrice },
        after: { unitPrice },
        metadata: { ...override, confirmedBelowCost: override.belowCost },
      });
    }
    return this.receipt(user, sale.id);
  }

  /** Sales and voids posted at a site on one local day, newest first. Staff see only their own (CASHIER F-07). */
  async list(user: AuthUser, query: SalesListQueryDto) {
    const date = query.date ?? businessDate();
    if (!isBusinessDate(date)) throw new BadRequestException('date must be a valid YYYY-MM-DD');
    const { start, end } = businessRange(date, date);
    const ownOnly = user.role === 'STAFF';
    const documents = await this.prisma.document.findMany({
      where: {
        companyId: user.companyId,
        siteId: query.siteId,
        type: 'SALE',
        status: 'POSTED',
        postedAt: { gte: start, lt: end },
        ...(ownOnly ? { createdById: user.id } : {}),
      },
      select: {
        id: true,
        number: true,
        postedAt: true,
        paymentMethod: true,
        notes: true,
        createdBy: { select: { id: true, name: true } },
        reversalOf: { select: { id: true, number: true } },
        reversedBy: { select: { id: true, number: true, postedAt: true } },
        lines: { select: { quantity: true, lineTotal: true } },
      },
      orderBy: { postedAt: 'desc' },
    });
    return {
      siteId: query.siteId,
      date,
      sales: documents.map((doc) => ({
        id: doc.id,
        number: doc.number,
        kind: doc.reversalOf ? ('VOID' as const) : ('SALE' as const),
        postedAt: doc.postedAt!.toISOString(),
        paymentMethod: doc.paymentMethod,
        total: round2(doc.lines.reduce((sum, line) => sum + toNumber(line.lineTotal ?? 0), 0)),
        lineCount: doc.lines.length,
        cashier: doc.createdBy,
        note: doc.notes,
        reversalOf: doc.reversalOf,
        voidedBy: doc.reversedBy ? { ...doc.reversedBy, postedAt: doc.reversedBy.postedAt?.toISOString() ?? null } : null,
      })),
    };
  }

  async get(user: AuthUser, id: string) {
    const receipt = await this.receipt(user, id);
    // Staff may only open their own receipts (CASHIER F-07).
    if (user.role === 'STAFF' && receipt.sale.cashier?.id !== user.id) {
      throw new NotFoundException('Sale not found');
    }
    return receipt;
  }

  /** A void is a new SALE document with direction IN: every movement of the sale comes back at the cost it left at. */
  async void(user: AuthUser, id: string, dto: VoidSaleDto) {
    const original = await this.prisma.document.findFirst({
      where: { id, companyId: user.companyId, type: 'SALE' },
      include: {
        reversedBy: { select: { id: true } },
        lines: { orderBy: { position: 'asc' }, include: { movements: true } },
      },
    });
    if (!original) throw new NotFoundException('Sale not found');
    this.assertSiteAccess(user, original.siteId);
    if (original.reversalOfId) throw new BadRequestException('A void cannot be voided');
    if (original.reversedBy) throw new ConflictException('This sale was already voided');

    const now = new Date();
    let voidId: string;
    try {
      voidId = await this.prisma.$transaction(
        async (tx) => {
          await lockSites(tx, [original.siteId]);
          const productIds = [...new Set(original.lines.map((line) => line.productId!))];
          const { book } = await loadCostBook(tx, user.companyId, original.siteId, productIds);
          const created = await tx.document.create({
            data: {
              companyId: user.companyId,
              siteId: original.siteId,
              type: 'SALE',
              status: 'POSTED',
              direction: 'IN',
              number: `${original.number}-V`,
              issuedOn: dateOnly(businessDate(now)),
              postedAt: now,
              paymentMethod: original.paymentMethod,
              createdById: user.id,
              reversalOfId: original.id,
              notes: dto.reason ?? null,
              lines: {
                create: original.lines.map((line) => ({
                  companyId: user.companyId,
                  position: line.position,
                  productId: line.productId,
                  batchId: line.batchId,
                  unit: line.unit,
                  quantity: line.quantity,
                  unitPrice: line.unitPrice,
                  discountPercent: line.discountPercent,
                  finalUnitPrice: line.finalUnitPrice,
                  lineTotal: line.lineTotal,
                  vatRate: line.vatRate,
                })),
              },
            },
            select: { id: true, lines: { select: { id: true, position: true } } },
          });
          const lineIdByPosition = new Map(created.lines.map((line) => [line.position, line.id]));
          const movements = original.lines.flatMap((line) =>
            line.movements
              .filter((movement) => movement.direction === 'OUT')
              .map((movement) => {
                const quantity = toNumber(movement.quantity);
                const unitCost = movement.unitCost === null ? book.unitCost(movement.productId, movement.batchId) : toNumber(movement.unitCost);
                book.restore(movement.productId, movement.batchId, quantity, unitCost);
                return {
                  companyId: user.companyId,
                  siteId: original.siteId,
                  documentId: created.id,
                  documentLineId: lineIdByPosition.get(line.position)!,
                  productId: movement.productId,
                  batchId: movement.batchId,
                  direction: 'IN' as const,
                  quantity,
                  unitCost,
                  reversalOfId: movement.id,
                  occurredAt: now,
                };
              }),
          );
          await tx.stockMovement.createMany({ data: movements });
          await saveAverages(tx, user.companyId, original.siteId, book);
          return created.id;
        },
        { timeout: 30_000 },
      );
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('This sale was already voided');
      }
      throw error;
    }

    await this.log(user, { id: voidId, number: `${original.number}-V` }, 'VOID', { metadata: { sale: original.number, reason: dto.reason ?? null } });
    return this.receipt(user, original.id);
  }

  /** Turnover, tickets, average ticket, cash / card, VAT and (for managers) cost and profit over local dates. */
  async report(user: AuthUser, query: SalesReportQueryDto) {
    const { from, to } = this.period(query);
    // Product decision (CASHIER F-07): Staff see only their own daily totals, never site-wide turnover.
    const createdById = user.role === 'STAFF' ? user.id : undefined;
    const documents = await this.reportDocuments(user.companyId, query.siteId, from, to, createdById);
    const summary = summarizeSales(documents);
    const topProducts = marginRows(documents, 'product').slice(0, 10);
    const manager = isSalesManager(user.role);
    return {
      siteId: query.siteId,
      from,
      to,
      showsCost: manager,
      summary: manager ? summary : withoutCost(summary),
      topProducts: manager ? topProducts : topProducts.map((row) => withoutCost(row)),
    };
  }

  async margins(user: AuthUser, query: MarginsQueryDto) {
    const { from, to } = this.period(query);
    const by: MarginGrouping = query.by ?? 'product';
    const documents = await this.reportDocuments(user.companyId, query.siteId, from, to);
    const summary = summarizeSales(documents);
    return {
      siteId: query.siteId,
      from,
      to,
      by,
      totals: {
        gross: summary.turnover,
        net: summary.net,
        cost: summary.cost,
        profit: summary.profit,
        marginPercent: summary.marginPercent,
        linesWithoutCost: summary.linesWithoutCost,
      },
      rows: marginRows(documents, by),
    };
  }

  private period(query: { from?: string; to?: string }) {
    const to = query.to ?? query.from ?? businessDate();
    const from = query.from ?? to;
    if (!isBusinessDate(from) || !isBusinessDate(to)) throw new BadRequestException('Dates must be valid YYYY-MM-DD');
    if (from > to) throw new BadRequestException('from must not be after to');
    if (daysBetween(from, to) >= MAX_REPORT_DAYS) {
      throw new BadRequestException(`A report covers at most ${MAX_REPORT_DAYS} days (from ${addDays(to, 1 - MAX_REPORT_DAYS)})`);
    }
    return { from, to };
  }

  private async reportDocuments(
    companyId: string,
    siteId: string,
    from: string,
    to: string,
    createdById?: string,
  ): Promise<ReportDocument[]> {
    const { start, end } = businessRange(from, to);
    const documents = await this.prisma.document.findMany({
      where: {
        companyId,
        siteId,
        type: 'SALE',
        status: 'POSTED',
        postedAt: { gte: start, lt: end },
        ...(createdById ? { createdById } : {}),
      },
      select: {
        id: true,
        direction: true,
        paymentMethod: true,
        postedAt: true,
        lines: {
          select: {
            productId: true,
            quantity: true,
            lineTotal: true,
            vatRate: true,
            product: { select: { name: true, code: true, group: { select: { id: true, name: true } } } },
            movements: { select: { quantity: true, unitCost: true } },
          },
        },
      },
    });
    return documents.map((doc) => ({
      id: doc.id,
      sign: doc.direction === 'OUT' ? 1 : -1,
      paymentMethod: (doc.paymentMethod ?? 'CASH') as PaymentMethod,
      hour: businessHour(doc.postedAt!),
      lines: doc.lines.map((line) => ({
        productId: line.productId!,
        productName: line.product?.name ?? '',
        productCode: line.product?.code ?? '',
        group: line.product?.group ?? null,
        quantity: toNumber(line.quantity),
        gross: toNumber(line.lineTotal ?? 0),
        vatRate: toNumber(line.vatRate),
        cost:
          line.movements.length === 0 || line.movements.some((movement) => movement.unitCost === null)
            ? null
            : line.movements.reduce((sum, movement) => sum + toNumber(movement.quantity) * toNumber(movement.unitCost!), 0),
      })),
    }));
  }

  private async receipt(user: AuthUser, id: string) {
    const doc = await this.prisma.document.findFirst({
      where: { id, companyId: user.companyId, type: 'SALE' },
      include: {
        site: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
        reversalOf: { select: { id: true, number: true, postedAt: true } },
        reversedBy: {
          select: { id: true, number: true, postedAt: true, notes: true, createdBy: { select: { id: true, name: true } } },
        },
        lines: {
          orderBy: { position: 'asc' },
          include: {
            product: { select: { id: true, name: true, code: true, unit: true } },
            batch: { select: { id: true, batchNumber: true, expiryDate: true } },
            movements: {
              orderBy: { createdAt: 'asc' },
              select: {
                productId: true,
                quantity: true,
                unitCost: true,
                product: { select: { name: true, unit: true } },
                batch: { select: { batchNumber: true } },
              },
            },
          },
        },
      },
    });
    if (!doc) throw new NotFoundException('Sale not found');
    this.assertSiteAccess(user, doc.siteId);

    const manager = isSalesManager(user.role);
    const vat = new Map<number, { rate: number; gross: number; net: number }>();
    let total = 0;
    let cost = 0;
    const lines = doc.lines.map((line) => {
      const gross = toNumber(line.lineTotal ?? 0);
      const rate = toNumber(line.vatRate);
      const lineCost = line.movements.reduce(
        (sum, movement) => sum + toNumber(movement.quantity) * (movement.unitCost === null ? 0 : toNumber(movement.unitCost)),
        0,
      );
      total += gross;
      cost += lineCost;
      const bucket = vat.get(rate) ?? { rate, gross: 0, net: 0 };
      bucket.gross += gross;
      bucket.net += gross / (1 + rate / 100);
      vat.set(rate, bucket);
      const issued = line.movements
        .filter((movement) => movement.productId !== line.productId)
        .map((movement) => ({
          productId: movement.productId,
          name: movement.product.name,
          unit: movement.product.unit,
          batchNumber: movement.batch?.batchNumber ?? null,
          quantity: toNumber(movement.quantity),
        }));
      return {
        id: line.id,
        product: line.product,
        batch: line.batch
          ? { ...line.batch, expiryDate: line.batch.expiryDate ? isoDate(line.batch.expiryDate) : null }
          : null,
        quantity: toNumber(line.quantity),
        unitPrice: toNumber(line.unitPrice),
        lineTotal: gross,
        vatRate: rate,
        ...(manager ? { cost: round2(lineCost), ...(issued.length ? { issued } : {}) } : {}),
      };
    });
    const net = [...vat.values()].reduce((sum, row) => sum + row.net, 0);

    return {
      sale: {
        id: doc.id,
        number: doc.number,
        kind: doc.reversalOfId ? ('VOID' as const) : ('SALE' as const),
        postedAt: doc.postedAt?.toISOString() ?? null,
        businessDate: doc.postedAt ? businessDate(doc.postedAt) : isoDate(doc.issuedOn),
        paymentMethod: doc.paymentMethod,
        paymentReference: doc.paymentReference,
        site: doc.site,
        cashier: doc.createdBy,
        note: doc.notes,
        reversalOf: doc.reversalOf ? { ...doc.reversalOf, postedAt: doc.reversalOf.postedAt?.toISOString() ?? null } : null,
        voidedBy: doc.reversedBy
          ? {
              id: doc.reversedBy.id,
              number: doc.reversedBy.number,
              postedAt: doc.reversedBy.postedAt?.toISOString() ?? null,
              reason: doc.reversedBy.notes,
              by: doc.reversedBy.createdBy,
            }
          : null,
        total: round2(total),
        vat: [...vat.values()]
          .sort((a, b) => b.rate - a.rate)
          .map((row) => ({ rate: row.rate, gross: round2(row.gross), net: round2(row.net), vat: round2(row.gross - row.net) })),
        ...(manager ? { cost: round2(cost), profit: round2(net - cost) } : {}),
        canVoid: manager && !doc.reversalOfId && !doc.reversedBy,
        lines,
      },
    };
  }

  private findByRequest(companyId: string, clientRequestId: string) {
    return this.prisma.document
      .findUnique({ where: { companyId_clientRequestId: { companyId, clientRequestId } }, select: { id: true } })
      .then((row) => row?.id ?? null);
  }

  /** S20260928-0001: numbered per company and local day. Runs under a company lock inside the sale transaction. */
  private async nextSaleNumber(tx: Prisma.TransactionClient, companyId: string, today: string) {
    await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtext(${`sale-number:${companyId}`}))`;
    const count = await tx.document.count({
      where: { companyId, type: 'SALE', reversalOfId: null, issuedOn: dateOnly(today) },
    });
    return `S${today.replaceAll('-', '')}-${String(count + 1).padStart(4, '0')}`;
  }

  private assertSiteAccess(user: AuthUser, siteId: string) {
    if (!user.allSites && !user.siteIds.includes(siteId)) {
      throw new ForbiddenException('Sale is outside your assigned locations');
    }
  }

  private async log(
    user: AuthUser,
    sale: { id: string; number: string },
    action: string,
    entry: { before?: Record<string, unknown>; after?: Record<string, unknown>; metadata?: Record<string, unknown> },
  ) {
    await recordActivity(this.prisma, user, { entityType: 'Document', entityId: sale.id, label: sale.number, action, ...entry });
  }
}
