import { Injectable, NotFoundException } from '@nestjs/common';
import type { AuthUser } from '@skladnik/shared';
import { toNumber } from '../common/decimal';
import { PrismaService } from '../prisma/prisma.service';
import { loadCostBook, siteLedger } from './ledger';
import { suggestedOrderQty } from './reorder';
import {
  compareBatchExpiry,
  compareStockLevels,
  foldBatches,
  foldMovements,
  stockLevelStatus,
  type MovementSum,
} from './stock-levels';

const round3 = (value: number) => Math.round(value * 1000) / 1000;
const round4 = (value: number) => Math.round(value * 10000) / 10000;
const round2 = (value: number) => Math.round(value * 100) / 100;
const isoDate = (value: Date) => value.toISOString().slice(0, 10);

const MOVEMENTS_SHOWN = 500;

@Injectable()
export class StockService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * On-hand and value per product and batch at one site, computed from the StockMovement ledger.
   * Batches are valued at their own cost, stock without a batch at the site's moving average.
   */
  async levels(user: AuthUser, siteId: string) {
    const { book, rows } = await loadCostBook(this.prisma, user.companyId, siteId);
    const movements: MovementSum[] = rows.flatMap((row) => [
      { productId: row.productId, batchId: row.batchId, direction: 'IN' as const, quantity: row.inTotal, lastAt: row.lastAt },
      { productId: row.productId, batchId: row.batchId, direction: 'OUT' as const, quantity: row.outTotal, lastAt: null },
    ]);
    const onHand = foldMovements(movements);
    if (onHand.size === 0) return { siteId, items: [] };
    const batchOnHand = foldBatches(movements);

    const batchIds = [...batchOnHand.values()].flatMap((batches) => [...batches.keys()]);
    const [products, batchRows] = await Promise.all([
      this.prisma.product.findMany({
        where: { companyId: user.companyId, id: { in: [...onHand.keys()] } },
        select: {
          id: true,
          name: true,
          code: true,
          unit: true,
          minStock: true,
          maxStock: true,
          purchasePrice: true,
          sellingPrice: true,
          vatRate: true,
          batchTracking: true,
          status: true,
          group: { select: { id: true, name: true } },
          barcodes: { select: { barcode: true } },
        },
      }),
      batchIds.length
        ? this.prisma.batch.findMany({
            where: { companyId: user.companyId, id: { in: batchIds } },
            select: { id: true, batchNumber: true, expiryDate: true },
          })
        : Promise.resolve([]),
    ]);
    const batchById = new Map(batchRows.map((batch) => [batch.id, batch]));

    const items = products
      .map((product) => {
        const level = onHand.get(product.id)!;
        const minStock = toNumber(product.minStock);
        const maxStock = product.maxStock === null ? null : toNumber(product.maxStock);
        const value = book.value(product.id);
        const batches = [...(batchOnHand.get(product.id) ?? new Map<string, number>())]
          .filter(([, quantity]) => quantity > 0)
          .flatMap(([batchId, quantity]) => {
            const batch = batchById.get(batchId);
            if (!batch) return [];
            const unitCost = book.unitCost(product.id, batchId);
            return [
              {
                batchId,
                batchNumber: batch.batchNumber,
                expiryDate: batch.expiryDate ? isoDate(batch.expiryDate) : null,
                onHand: quantity,
                unitCost,
                value: round2(quantity * unitCost),
              },
            ];
          })
          .sort(compareBatchExpiry);
        return {
          productId: product.id,
          name: product.name,
          code: product.code,
          unit: product.unit,
          productStatus: product.status,
          batchTracking: product.batchTracking,
          group: product.group,
          barcodes: product.barcodes.map((row) => row.barcode),
          minStock,
          maxStock,
          purchasePrice: toNumber(product.purchasePrice),
          sellingPrice: toNumber(product.sellingPrice),
          vatRate: toNumber(product.vatRate),
          avgCost: level.onHand > 0 ? round4(value / level.onHand) : book.average(product.id),
          value: round2(value),
          onHand: level.onHand,
          status: stockLevelStatus(level.onHand, minStock),
          suggestedOrder: suggestedOrderQty(level.onHand, minStock, maxStock, product.unit),
          lastMovementAt: level.lastMovementAt?.toISOString() ?? null,
          batches,
        };
      })
      .filter((item) => item.productStatus !== 'ARCHIVED' || item.onHand !== 0)
      .sort(compareStockLevels);

    return { siteId, items };
  }

  /** Every movement of one product at one site, newest first, each traceable to its document. */
  async movements(user: AuthUser, siteId: string, productId: string, batchId?: string) {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, companyId: user.companyId },
      select: { id: true, name: true, code: true, unit: true, batchTracking: true, status: true },
    });
    if (!product) throw new NotFoundException('Product not found');

    const rows = await this.prisma.stockMovement.findMany({
      where: { companyId: user.companyId, siteId, productId, ...(batchId ? { batchId } : {}) },
      include: {
        batch: { select: { id: true, batchNumber: true, expiryDate: true } },
        document: {
          select: {
            id: true,
            type: true,
            number: true,
            writeOffReason: true,
            reversalOfId: true,
            siteId: true,
            partner: { select: { id: true, name: true } },
            site: { select: { id: true, name: true } },
            targetSite: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: [{ occurredAt: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    });

    let balance = 0;
    const movements = rows.map((row) => {
      const quantity = toNumber(row.quantity);
      balance = round3(balance + (row.direction === 'IN' ? quantity : -quantity));
      const unitCost = row.unitCost === null ? null : toNumber(row.unitCost);
      const doc = row.document;
      const counterpartSite =
        doc?.type === 'TRANSFER' ? (doc.siteId === siteId ? doc.targetSite : doc.site) : null;
      return {
        id: row.id,
        occurredAt: isoDate(row.occurredAt),
        direction: row.direction,
        quantity,
        unitCost,
        value: unitCost === null ? null : round2(quantity * unitCost),
        balance,
        batch: row.batch
          ? { id: row.batch.id, batchNumber: row.batch.batchNumber, expiryDate: row.batch.expiryDate ? isoDate(row.batch.expiryDate) : null }
          : null,
        document: doc
          ? {
              id: doc.id,
              type: doc.type,
              number: doc.number,
              writeOffReason: doc.writeOffReason,
              reversal: doc.reversalOfId !== null,
              partner: doc.partner,
              counterpartSite,
            }
          : null,
      };
    });

    const batchRows = product.batchTracking
      ? await this.prisma.stockMovement.groupBy({
          by: ['batchId', 'direction'],
          where: { companyId: user.companyId, siteId, productId, batchId: { not: null } },
          _sum: { quantity: true },
        })
      : [];
    const batchTotals = new Map<string, number>();
    for (const row of batchRows) {
      const signed = toNumber(row._sum.quantity ?? 0) * (row.direction === 'IN' ? 1 : -1);
      batchTotals.set(row.batchId!, round3((batchTotals.get(row.batchId!) ?? 0) + signed));
    }
    const batchInfo = batchTotals.size
      ? await this.prisma.batch.findMany({
          where: { id: { in: [...batchTotals.keys()] } },
          select: { id: true, batchNumber: true, expiryDate: true },
        })
      : [];

    return {
      siteId,
      product,
      onHand: balance,
      batches: batchInfo
        .map((batch) => ({
          batchId: batch.id,
          batchNumber: batch.batchNumber,
          expiryDate: batch.expiryDate ? isoDate(batch.expiryDate) : null,
          onHand: batchTotals.get(batch.id) ?? 0,
        }))
        .sort(compareBatchExpiry),
      movements: movements.reverse().slice(0, MOVEMENTS_SHOWN),
      truncated: movements.length > MOVEMENTS_SHOWN,
    };
  }

  /**
   * Products below their minimum at this site, grouped by the supplier we last bought them from
   * (else a supplier with a mapped code). Products that never moved anywhere are included so a new
   * catalog item with a minimum shows up; products that only live at other sites are not.
   */
  async reorder(user: AuthUser, siteId: string) {
    const rows = await siteLedger(this.prisma, user.companyId, siteId);
    const onHand = new Map<string, number>();
    for (const row of rows) onHand.set(row.productId, round3((onHand.get(row.productId) ?? 0) + row.onHand));

    const products = await this.prisma.product.findMany({
      where: { companyId: user.companyId, status: { not: 'ARCHIVED' }, minStock: { gt: 0 } },
      select: {
        id: true,
        name: true,
        code: true,
        unit: true,
        minStock: true,
        maxStock: true,
        purchasePrice: true,
        supplierCodes: { select: { partnerId: true, supplierCode: true }, orderBy: { createdAt: 'asc' } },
      },
      orderBy: { name: 'asc' },
    });
    const elsewhere = products.filter((product) => !onHand.has(product.id)).map((product) => product.id);
    const movedElsewhere = new Set(
      elsewhere.length
        ? (
            await this.prisma.stockMovement.groupBy({
              by: ['productId'],
              where: { companyId: user.companyId, productId: { in: elsewhere } },
            })
          ).map((row) => row.productId)
        : [],
    );

    const candidates = products.flatMap((product) => {
      if (!onHand.has(product.id) && movedElsewhere.has(product.id)) return [];
      const level = onHand.get(product.id) ?? 0;
      const minStock = toNumber(product.minStock);
      const maxStock = product.maxStock === null ? null : toNumber(product.maxStock);
      const suggested = suggestedOrderQty(level, minStock, maxStock, product.unit);
      return suggested === null ? [] : [{ product, onHand: level, minStock, maxStock, suggested }];
    });
    if (candidates.length === 0) return { siteId, suppliers: [] };

    const lastPurchases = await this.prisma.$queryRaw<{ productId: string; partnerId: string; price: number }[]>`
      SELECT DISTINCT ON (l."productId") l."productId", d."partnerId",
        COALESCE(l."finalUnitPrice", l."unitPrice")::float8 AS "price"
      FROM "DocumentLine" l
      JOIN "Document" d ON d."id" = l."documentId"
      WHERE d."companyId" = ${user.companyId}
        AND d."status" = 'POSTED'
        AND d."type" IN ('INVOICE', 'RECEIPT')
        AND d."partnerId" IS NOT NULL
        AND l."productId" = ANY(${candidates.map((row) => row.product.id)})
      ORDER BY l."productId", d."issuedOn" DESC, d."postedAt" DESC
    `;
    const lastByProduct = new Map(lastPurchases.map((row) => [row.productId, row]));

    const groups = new Map<string | null, ReturnType<typeof toLine>[]>();
    function toLine(row: (typeof candidates)[number], supplierId: string | null) {
      const last = lastByProduct.get(row.product.id);
      const unitPrice = last?.price ?? toNumber(row.product.purchasePrice);
      return {
        productId: row.product.id,
        name: row.product.name,
        code: row.product.code,
        unit: row.product.unit,
        supplierCode: row.product.supplierCodes.find((code) => code.partnerId === supplierId)?.supplierCode ?? null,
        onHand: row.onHand,
        minStock: row.minStock,
        maxStock: row.maxStock,
        suggestedQty: row.suggested,
        unitPrice,
        lineTotal: round2(unitPrice * row.suggested),
      };
    }
    for (const row of candidates) {
      const supplierId = lastByProduct.get(row.product.id)?.partnerId ?? row.product.supplierCodes[0]?.partnerId ?? null;
      const lines = groups.get(supplierId) ?? [];
      lines.push(toLine(row, supplierId));
      groups.set(supplierId, lines);
    }

    const partnerIds = [...groups.keys()].filter((id): id is string => Boolean(id));
    const partners = await this.prisma.partner.findMany({
      where: { companyId: user.companyId, id: { in: partnerIds } },
      select: { id: true, name: true, phone: true, email: true, taxId: true },
    });
    const partnerById = new Map(partners.map((partner) => [partner.id, partner]));

    const suppliers = [...groups]
      .map(([partnerId, lines]) => ({
        partner: partnerId ? (partnerById.get(partnerId) ?? null) : null,
        lines,
        total: round2(lines.reduce((sum, line) => sum + line.lineTotal, 0)),
      }))
      .sort((a, b) => (a.partner ? (b.partner ? a.partner.name.localeCompare(b.partner.name) : -1) : 1));
    return { siteId, suppliers };
  }
}
