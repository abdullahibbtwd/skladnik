import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  BUSINESS_TIME_ZONE,
  DEFAULT_CSV_FORMAT,
  MAX_REPORT_PERIOD_DAYS,
  REPORT_DOCUMENT_TYPE_LABELS,
  REPORT_TEXT,
  REPORT_TITLES,
  REPORT_UNIT_LABELS,
  STOCK_VALUE_GROUPINGS,
  TURNOVER_GROUPINGS,
  WRITE_OFF_REASON_LABELS,
  partnerTaxNumber,
  reportColumn,
  reportColumnLabel,
  type AuthUser,
  type CsvFormat,
  type DocumentType,
  type ExportProfileColumn,
  type ReportKind,
  type ReportLang,
  type ReportResult,
  type ReportRow,
  type StockValueGrouping,
  type TurnoverGrouping,
  type WriteOffReason,
} from '@skladnik/shared';
import { toNumber } from '../common/decimal';
import { STANDING_DOCUMENT } from '../documents/reversal';
import { PrismaService } from '../prisma/prisma.service';
import { addDays, businessDate, businessRange, dayStart, daysBetween, isBusinessDate } from '../sales/business-day';
import { IN_BASIS_QTY, IN_BASIS_VALUE } from '../stock/ledger';
import { stockAsOfEnd } from '../stock/stock-as-of';
import type { ReportExportQueryDto, ReportQueryDto } from './dto/report.dto';
import { formatDate } from './export/cells';
import { buildCsv } from './export/csv';
import { buildXlsx } from './export/xlsx';
import {
  expiryStatus,
  marginPercent,
  periodKey,
  periodKeys,
  rankBy,
  rateKey,
  round2,
  round3,
  round4,
  runningBalances,
  sharePercent,
  splitGross,
  type PeriodGrouping,
} from './report-math';

type Site = { id: string; name: string };
type Scope = { companyId: string; company: string; sites: Site[]; siteIds: string[]; siteName: Map<string, string>; multi: boolean; allSites: boolean };
type Ctx = { lang: ReportLang; scope: Scope; query: ReportQueryDto };
type Built = { columns: string[]; rows: ReportRow[]; totals: ReportRow | null; notes: string[]; from?: string; to?: string; date?: string };

type ProductInfo = { code: string; name: string; unit: string; sellingPrice: number | null; groupId: string | null; groupName: string | null };

type SaleFact = {
  documentId: string;
  number: string;
  siteId: string;
  date: string;
  sign: 1 | -1;
  productId: string;
  product: ProductInfo;
  quantity: number;
  gross: number;
  vatRate: number;
  cost: number | null;
};

type RateAmounts = { rate: number; net: number; vat: number };
type VatEntry = {
  section: 'purchases' | 'sales';
  date: string;
  documentType: string;
  number: string;
  partner: string | null;
  partnerTaxId: string | null;
  siteId: string;
  documents: number;
  rates: Map<string, RateAmounts>;
  documentId: string | null;
};

const JOURNAL_LIMIT = 5000;
const isoDate = (value: Date) => value.toISOString().slice(0, 10);
const dateValue = (value: string) => new Date(`${value}T00:00:00Z`);
const BG_CSV_FORMAT: CsvFormat = { delimiter: ';', decimalSeparator: ',', dateFormat: 'DD.MM.YYYY', encoding: 'UTF8_BOM', includeHeader: true };

/** Accountant-facing reports (§4.6). Each returns the same table shape; exports reuse it (§4.8). */
@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async run(user: AuthUser, kind: ReportKind, query: ReportQueryDto): Promise<ReportResult> {
    const lang = query.lang ?? 'en';
    const scope = await this.scope(user, query.siteId);
    const built = await this.build(kind, { lang, scope, query });
    return {
      kind,
      title: REPORT_TITLES[kind][lang],
      columns: built.columns,
      rows: built.rows,
      totals: built.totals,
      scope: {
        company: scope.company,
        from: built.from ?? null,
        to: built.to ?? null,
        date: built.date ?? null,
        sites: scope.sites,
        allSites: scope.allSites,
      },
      notes: built.notes,
      generatedAt: new Date().toISOString(),
    };
  }

  async export(user: AuthUser, kind: ReportKind, query: ReportExportQueryDto) {
    const lang = query.lang ?? 'en';
    const profile = query.profileId
      ? await this.prisma.exportProfile.findFirst({ where: { id: query.profileId, companyId: user.companyId } })
      : null;
    if (query.profileId && !profile) throw new NotFoundException('Export layout not found');
    if (profile && profile.reportKind !== kind) throw new BadRequestException('This layout belongs to another report');

    const report = await this.run(user, kind, query);
    const fileFormat = query.format;
    const columns = profile
      ? (profile.columns as ExportProfileColumn[]).map((column) => ({ ...column, type: reportColumn(column.key).type }))
      : report.columns.map((key) => ({ key, header: reportColumnLabel(key, lang), type: reportColumn(key).type }));
    const cells = (row: ReportRow) => columns.map((column) => row[column.key] ?? null);
    const { from, to, date } = report.scope;
    const stamp = date ?? (from === to ? from : `${from}_${to}`);
    const baseName = `${kind}_${stamp}`;

    if (fileFormat === 'csv') {
      const format: CsvFormat = profile
        ? {
            delimiter: profile.delimiter as CsvFormat['delimiter'],
            decimalSeparator: profile.decimalSeparator as CsvFormat['decimalSeparator'],
            dateFormat: profile.dateFormat as CsvFormat['dateFormat'],
            encoding: profile.encoding as CsvFormat['encoding'],
            includeHeader: profile.includeHeader,
          }
        : lang === 'bg'
          ? BG_CSV_FORMAT
          : DEFAULT_CSV_FORMAT;
      // Subtotal and total rows are left out so the file imports as plain data.
      const body = buildCsv(columns, report.rows.filter((row) => !row._total).map(cells), format);
      return {
        body,
        fileName: `${baseName}.csv`,
        contentType: `text/csv; charset=${format.encoding === 'WINDOWS_1251' ? 'windows-1251' : 'utf-8'}`,
      };
    }

    const siteLine = report.scope.allSites ? this.text('allSites', lang) : report.scope.sites.map((site) => site.name).join(', ');
    const dateFormat = lang === 'bg' ? 'DD.MM.YYYY' : 'YYYY-MM-DD';
    const periodLine = date
      ? `${this.text('asOf', lang)}: ${formatDate(date, dateFormat)}`
      : `${this.text('period', lang)}: ${formatDate(from!, dateFormat)} – ${formatDate(to!, dateFormat)}`;
    const generated = new Intl.DateTimeFormat(lang === 'bg' ? 'bg-BG' : 'en-GB', {
      dateStyle: 'short',
      timeStyle: 'short',
      timeZone: BUSINESS_TIME_ZONE,
    }).format(new Date(report.generatedAt));
    const body = await buildXlsx({
      sheetName: report.title,
      heading: [report.title, `${report.scope.company} — ${siteLine}`, periodLine, `${this.text('generated', lang)}: ${generated}`],
      columns,
      rows: report.rows.map(cells),
      boldRows: report.rows.flatMap((row, index) => (row._total ? [index] : [])),
      totals: report.totals ? cells(report.totals) : null,
      notes: report.notes,
      dateFormat: lang === 'bg' ? 'dd.mm.yyyy' : 'yyyy-mm-dd',
    });
    return {
      body,
      fileName: `${baseName}.xlsx`,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };
  }

  /** Sites a report may read: the one asked for, or every site the user can see (inactive ones too, for history). */
  async scope(user: AuthUser, siteId?: string): Promise<Scope> {
    if (siteId && !user.allSites && !user.siteIds.includes(siteId)) throw new ForbiddenException('No access to this site');
    const [company, sites] = await Promise.all([
      this.prisma.company.findUnique({ where: { id: user.companyId }, select: { name: true } }),
      this.prisma.site.findMany({
        where: { companyId: user.companyId, ...(siteId ? { id: siteId } : user.allSites ? {} : { id: { in: user.siteIds } }) },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
    ]);
    if (siteId && sites.length === 0) throw new NotFoundException('Site not found');
    return {
      companyId: user.companyId,
      company: company?.name ?? '',
      sites,
      siteIds: sites.map((site) => site.id),
      siteName: new Map(sites.map((site) => [site.id, site.name])),
      multi: sites.length > 1,
      allSites: !siteId && user.allSites,
    };
  }

  private build(kind: ReportKind, ctx: Ctx): Promise<Built> {
    switch (kind) {
      case 'turnover':
        return this.turnover(ctx);
      case 'stock-value':
        return this.stockValue(ctx);
      case 'batches':
        return this.batches(ctx);
      case 'movements':
        return ctx.query.productId ? this.movementJournal(ctx, ctx.query.productId) : this.movementSummary(ctx);
      case 'top-products':
        return this.topProducts(ctx);
      case 'slow-movers':
        return this.slowMovers(ctx);
      case 'write-offs':
        return this.writeOffs(ctx);
      case 'stocktake-variances':
        return this.stocktakeVariances(ctx);
      case 'vat-summary':
        return this.vatSummary(ctx);
      case 'vat-journal':
        return this.vatJournal(ctx);
    }
  }

  // ─── Sales ─────────────────────────────────────────────────────────────────

  private async turnover(ctx: Ctx): Promise<Built> {
    const { from, to } = this.period(ctx.query);
    const by = (ctx.query.groupBy ?? 'day') as TurnoverGrouping;
    if (!TURNOVER_GROUPINGS.includes(by)) throw new BadRequestException(`Turnover groups by ${TURNOVER_GROUPINGS.join(', ')}`);
    const facts = this.inGroup(await this.saleFacts(ctx, from, to), ctx.query.groupId);

    type Bucket = { label: string; receipts: Map<string, 1 | -1>; gross: number; net: number; cost: number };
    const buckets = new Map<string, Bucket>();
    const bucket = (key: string, label: string) => {
      let found = buckets.get(key);
      if (!found) {
        found = { label, receipts: new Map(), gross: 0, net: 0, cost: 0 };
        buckets.set(key, found);
      }
      return found;
    };
    const periodic = by === 'day' || by === 'week' || by === 'month';
    if (periodic) for (const key of periodKeys(from, to, by as PeriodGrouping)) bucket(key, key);

    const total: Bucket = { label: '', receipts: new Map(), gross: 0, net: 0, cost: 0 };
    let missingCost = 0;
    for (const fact of facts) {
      const key = by === 'site' ? fact.siteId : by === 'group' ? (fact.product.groupId ?? '') : periodKey(fact.date, by as PeriodGrouping);
      const label =
        by === 'site'
          ? (ctx.scope.siteName.get(fact.siteId) ?? '')
          : by === 'group'
            ? (fact.product.groupName ?? this.text('noGroup', ctx.lang))
            : key;
      const net = splitGross(fact.gross, fact.vatRate).net;
      if (fact.cost === null) missingCost += 1;
      for (const target of [bucket(key, label), total]) {
        target.receipts.set(fact.documentId, fact.sign);
        target.gross += fact.sign * fact.gross;
        target.net += fact.sign * net;
        if (fact.cost !== null) target.cost += fact.sign * fact.cost;
      }
    }

    const labelKey = by === 'day' ? 'date' : by === 'site' ? 'site' : by === 'group' ? 'group' : 'period';
    const columns = [labelKey, ...(by === 'group' ? [] : ['receipts']), 'gross', 'net', 'vat', 'cost', 'profit', 'margin'];
    const toRow = (value: Bucket, label: string): ReportRow => ({
      [labelKey]: label,
      ...(by === 'group' ? {} : { receipts: [...value.receipts.values()].reduce<number>((sum, sign) => sum + sign, 0) }),
      ...this.profitCells(value.gross, value.net, value.cost),
    });
    let entries = [...buckets.values()];
    if (by === 'site') entries.sort((a, b) => a.label.localeCompare(b.label));
    if (by === 'group') entries = entries.sort((a, b) => b.net - a.net || a.label.localeCompare(b.label));

    const notes = [this.text('tillOnly', ctx.lang)];
    if (missingCost) notes.push(this.text('missingCost', ctx.lang));
    return {
      columns,
      rows: entries.map((entry) => toRow(entry, entry.label)),
      totals: toRow(total, this.text('total', ctx.lang)),
      notes,
      from,
      to,
    };
  }

  private async topProducts(ctx: Ctx): Promise<Built> {
    const { from, to } = this.period(ctx.query);
    const metric = ctx.query.metric ?? 'net';
    const limit = ctx.query.limit ?? 20;
    const facts = this.inGroup(await this.saleFacts(ctx, from, to), ctx.query.groupId);

    type Row = { name: string; product: ProductInfo; quantity: number; gross: number; net: number; cost: number };
    const byProduct = new Map<string, Row>();
    let missingCost = 0;
    for (const fact of facts) {
      let row = byProduct.get(fact.productId);
      if (!row) {
        row = { name: fact.product.name, product: fact.product, quantity: 0, gross: 0, net: 0, cost: 0 };
        byProduct.set(fact.productId, row);
      }
      row.quantity += fact.sign * fact.quantity;
      row.gross += fact.sign * fact.gross;
      row.net += fact.sign * splitGross(fact.gross, fact.vatRate).net;
      if (fact.cost === null) missingCost += 1;
      else row.cost += fact.sign * fact.cost;
    }
    const rows = [...byProduct.values()].filter((row) => round3(row.quantity) !== 0 || round2(row.gross) !== 0);
    const metricOf = (row: Row) => (metric === 'quantity' ? row.quantity : metric === 'profit' ? row.net - row.cost : row.net);
    const all = rows.reduce((sum, row) => sum + metricOf(row), 0);
    const top = rankBy(rows, metricOf, limit);
    const sum = (pick: (row: Row) => number) => top.reduce((total, row) => total + pick(row), 0);

    const notes = [this.text('shareOfAll', ctx.lang), this.text('tillOnly', ctx.lang)];
    if (missingCost) notes.push(this.text('missingCost', ctx.lang));
    return {
      columns: ['rank', 'code', 'product', 'group', 'unit', 'quantity', 'gross', 'net', 'cost', 'profit', 'margin', 'share'],
      rows: top.map((row, index) => ({
        rank: index + 1,
        ...this.productCells(row.product, ctx.lang),
        quantity: round3(row.quantity),
        ...this.profitCells(row.gross, row.net, row.cost, false),
        share: sharePercent(metricOf(row), all),
      })),
      totals: {
        product: this.text('total', ctx.lang),
        quantity: metric === 'quantity' ? round3(sum((row) => row.quantity)) : null,
        ...this.profitCells(sum((row) => row.gross), sum((row) => row.net), sum((row) => row.cost), false),
        share: sharePercent(sum(metricOf), all),
      },
      notes,
      from,
      to,
    };
  }

  private async slowMovers(ctx: Ctx): Promise<Built> {
    const today = businessDate();
    const to = ctx.query.to ?? today;
    const { from } = this.period({ from: ctx.query.from ?? addDays(to, -29), to });
    const { start, end } = businessRange(from, to);
    const rows = await this.prisma.$queryRaw<
      { siteId: string; productId: string; onHand: number; value: number; sold: number; lastSale: Date | null }[]
    >`
      SELECT m."siteId", m."productId",
        SUM(CASE WHEN m."direction" = 'IN' THEN m."quantity" ELSE -m."quantity" END)::float8 AS "onHand",
        SUM(CASE WHEN m."direction" = 'IN' THEN m."quantity" ELSE -m."quantity" END * COALESCE(m."unitCost", 0))::float8 AS "value",
        COALESCE(SUM(CASE WHEN d."type" = 'SALE' AND m."occurredAt" >= ${start} AND m."occurredAt" < ${end}
          THEN CASE WHEN m."direction" = 'OUT' THEN m."quantity" ELSE -m."quantity" END END), 0)::float8 AS "sold",
        MAX(CASE WHEN d."type" = 'SALE' AND m."direction" = 'OUT' THEN m."occurredAt" END) AS "lastSale"
      FROM "StockMovement" m
      LEFT JOIN "Document" d ON d."id" = m."documentId"
      WHERE m."companyId" = ${ctx.scope.companyId} AND m."siteId" = ANY(${ctx.scope.siteIds})
      GROUP BY m."siteId", m."productId"
      HAVING SUM(CASE WHEN m."direction" = 'IN' THEN m."quantity" ELSE -m."quantity" END) > 0
    `;
    const products = await this.products(ctx.scope.companyId, rows.map((row) => row.productId));
    const listed = rows
      .filter((row) => this.productInGroup(products.get(row.productId), ctx.query.groupId))
      .map((row) => {
        const lastSale = row.lastSale ? businessDate(row.lastSale) : null;
        return { ...row, product: products.get(row.productId)!, lastSale, days: lastSale ? daysBetween(lastSale, today) : null };
      })
      .sort(
        (a, b) =>
          a.sold - b.sold ||
          (a.days === null ? -1 : b.days === null ? 1 : b.days - a.days) ||
          b.value - a.value ||
          a.product.name.localeCompare(b.product.name),
      )
      .slice(0, ctx.query.limit ?? 1000);

    return {
      columns: [...(ctx.scope.multi ? ['site'] : []), 'code', 'product', 'group', 'unit', 'onHand', 'value', 'soldQty', 'lastSale', 'daysSinceSale'],
      rows: listed.map((row) => ({
        site: ctx.scope.siteName.get(row.siteId) ?? '',
        ...this.productCells(row.product, ctx.lang),
        onHand: round3(row.onHand),
        value: round2(row.value),
        soldQty: round3(row.sold),
        lastSale: row.lastSale ?? this.text('never', ctx.lang),
        daysSinceSale: row.days,
        _productId: row.productId,
      })),
      totals: { product: this.text('total', ctx.lang), value: round2(listed.reduce((sum, row) => sum + row.value, 0)) },
      notes: [this.text('slowWindow', ctx.lang)],
      from,
      to,
    };
  }

  // ─── Stock ─────────────────────────────────────────────────────────────────

  private async stockValue(ctx: Ctx): Promise<Built> {
    const date = ctx.query.date ?? businessDate();
    if (!isBusinessDate(date)) throw new BadRequestException('date must be a valid YYYY-MM-DD');
    const by = (ctx.query.groupBy ?? 'product') as StockValueGrouping;
    if (!STOCK_VALUE_GROUPINGS.includes(by)) throw new BadRequestException(`Stock value groups by ${STOCK_VALUE_GROUPINGS.join(', ')}`);
    const end = stockAsOfEnd(date);
    const rows = await this.prisma.$queryRaw<{ siteId: string; productId: string; qty: number; value: number }[]>`
      SELECT "siteId", "productId",
        SUM(CASE WHEN "direction" = 'IN' THEN "quantity" ELSE -"quantity" END)::float8 AS "qty",
        SUM(CASE WHEN "direction" = 'IN' THEN "quantity" ELSE -"quantity" END * COALESCE("unitCost", 0))::float8 AS "value"
      FROM "StockMovement"
      WHERE "companyId" = ${ctx.scope.companyId} AND "siteId" = ANY(${ctx.scope.siteIds}) AND "occurredAt" < ${end}
      GROUP BY "siteId", "productId"
    `;
    const products = await this.products(ctx.scope.companyId, rows.map((row) => row.productId));
    const held = rows
      .filter((row) => round3(row.qty) !== 0 || round2(row.value) !== 0)
      .filter((row) => this.productInGroup(products.get(row.productId), ctx.query.groupId))
      .map((row) => ({ ...row, product: products.get(row.productId)! }));
    const retail = (row: (typeof held)[number]) => row.qty * (row.product.sellingPrice ?? 0);
    const totals = {
      value: round2(held.reduce((sum, row) => sum + row.value, 0)),
      retailValue: round2(held.reduce((sum, row) => sum + retail(row), 0)),
    };
    const notes = [this.text('valueFromLedger', ctx.lang)];

    if (by === 'product') {
      held.sort(
        (a, b) =>
          (ctx.scope.siteName.get(a.siteId) ?? '').localeCompare(ctx.scope.siteName.get(b.siteId) ?? '') ||
          a.product.name.localeCompare(b.product.name),
      );
      return {
        columns: [...(ctx.scope.multi ? ['site'] : []), 'code', 'product', 'group', 'unit', 'onHand', 'avgCost', 'value', 'sellingPrice', 'retailValue'],
        rows: held.map((row) => ({
          site: ctx.scope.siteName.get(row.siteId) ?? '',
          ...this.productCells(row.product, ctx.lang),
          onHand: round3(row.qty),
          avgCost: row.qty > 0 ? round4(row.value / row.qty) : null,
          value: round2(row.value),
          sellingPrice: row.product.sellingPrice == null ? null : round2(row.product.sellingPrice),
          retailValue: round2(retail(row)),
          _productId: row.productId,
        })),
        totals: { product: this.text('total', ctx.lang), ...totals },
        notes,
        date,
      };
    }

    const labelKey = by === 'site' ? 'site' : 'group';
    const groups = new Map<string, { label: string; products: Set<string>; value: number; retailValue: number }>();
    for (const row of held) {
      const key = by === 'site' ? row.siteId : (row.product.groupId ?? '');
      const label = by === 'site' ? (ctx.scope.siteName.get(row.siteId) ?? '') : (row.product.groupName ?? this.text('noGroup', ctx.lang));
      const group = groups.get(key) ?? { label, products: new Set<string>(), value: 0, retailValue: 0 };
      group.products.add(row.productId);
      group.value += row.value;
      group.retailValue += retail(row);
      groups.set(key, group);
    }
    return {
      columns: [labelKey, 'products', 'value', 'retailValue'],
      rows: [...groups.values()]
        .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label))
        .map((group) => ({ [labelKey]: group.label, products: group.products.size, value: round2(group.value), retailValue: round2(group.retailValue) })),
      totals: { [labelKey]: this.text('total', ctx.lang), products: new Set(held.map((row) => row.productId)).size, ...totals },
      notes,
      date,
    };
  }

  private async batches(ctx: Ctx): Promise<Built> {
    const today = businessDate();
    const rows = await this.prisma.$queryRaw<{ siteId: string; productId: string; batchId: string; qty: number; inQty: number; inValue: number }[]>`
      SELECT "siteId", "productId", "batchId",
        SUM(CASE WHEN "direction" = 'IN' THEN "quantity" ELSE -"quantity" END)::float8 AS "qty",
        ${IN_BASIS_QTY} AS "inQty",
        ${IN_BASIS_VALUE} AS "inValue"
      FROM "StockMovement"
      WHERE "companyId" = ${ctx.scope.companyId} AND "siteId" = ANY(${ctx.scope.siteIds}) AND "batchId" IS NOT NULL
      GROUP BY "siteId", "productId", "batchId"
      HAVING SUM(CASE WHEN "direction" = 'IN' THEN "quantity" ELSE -"quantity" END) <> 0
    `;
    const [products, batches] = await Promise.all([
      this.products(ctx.scope.companyId, rows.map((row) => row.productId)),
      this.prisma.batch.findMany({
        where: { companyId: ctx.scope.companyId, id: { in: rows.map((row) => row.batchId) } },
        select: { id: true, batchNumber: true, expiryDate: true },
      }),
    ]);
    const batchById = new Map(batches.map((batch) => [batch.id, batch]));
    const within = ctx.query.expiringWithin;
    const listed = rows
      .filter((row) => this.productInGroup(products.get(row.productId), ctx.query.groupId))
      .map((row) => {
        const batch = batchById.get(row.batchId);
        const expiry = batch?.expiryDate ? isoDate(batch.expiryDate) : null;
        const unitCost = row.inQty > 0 ? row.inValue / row.inQty : 0;
        return {
          ...row,
          product: products.get(row.productId)!,
          batchNumber: batch?.batchNumber ?? '',
          expiry,
          daysLeft: expiry ? daysBetween(today, expiry) : null,
          unitCost,
        };
      })
      .filter((row) => within === undefined || (row.daysLeft !== null && row.daysLeft <= within))
      .sort(
        (a, b) =>
          (a.expiry === null ? 1 : b.expiry === null ? -1 : a.expiry.localeCompare(b.expiry)) ||
          a.product.name.localeCompare(b.product.name) ||
          a.batchNumber.localeCompare(b.batchNumber),
      );
    return {
      columns: [
        ...(ctx.scope.multi ? ['site'] : []),
        'code', 'product', 'batch', 'expiry', 'daysLeft', 'expiryStatus', 'unit', 'onHand', 'unitCost', 'value',
      ],
      rows: listed.map((row) => {
        const status = expiryStatus(row.daysLeft);
        return {
          site: ctx.scope.siteName.get(row.siteId) ?? '',
          ...this.productCells(row.product, ctx.lang),
          batch: row.batchNumber,
          expiry: row.expiry,
          daysLeft: row.daysLeft,
          expiryStatus: this.text(status, ctx.lang),
          onHand: round3(row.qty),
          unitCost: round4(row.unitCost),
          value: round2(row.qty * row.unitCost),
          _status: status,
          _productId: row.productId,
        };
      }),
      totals: { product: this.text('total', ctx.lang), value: round2(listed.reduce((sum, row) => sum + row.qty * row.unitCost, 0)) },
      notes: [this.text('batchesToday', ctx.lang)],
      date: today,
    };
  }

  private async movementSummary(ctx: Ctx): Promise<Built> {
    const { from, to } = this.period(ctx.query);
    const { start, end } = businessRange(from, to);
    const rows = await this.prisma.$queryRaw<
      {
        siteId: string;
        productId: string;
        openingQty: number;
        openingValue: number;
        inQty: number;
        inValue: number;
        outQty: number;
        outValue: number;
      }[]
    >`
      SELECT "siteId", "productId",
        COALESCE(SUM(CASE WHEN "occurredAt" < ${start} THEN CASE WHEN "direction" = 'IN' THEN "quantity" ELSE -"quantity" END END), 0)::float8 AS "openingQty",
        COALESCE(SUM(CASE WHEN "occurredAt" < ${start} THEN CASE WHEN "direction" = 'IN' THEN "quantity" ELSE -"quantity" END * COALESCE("unitCost", 0) END), 0)::float8 AS "openingValue",
        COALESCE(SUM(CASE WHEN "occurredAt" >= ${start} AND "direction" = 'IN' THEN "quantity" END), 0)::float8 AS "inQty",
        COALESCE(SUM(CASE WHEN "occurredAt" >= ${start} AND "direction" = 'IN' THEN "quantity" * COALESCE("unitCost", 0) END), 0)::float8 AS "inValue",
        COALESCE(SUM(CASE WHEN "occurredAt" >= ${start} AND "direction" = 'OUT' THEN "quantity" END), 0)::float8 AS "outQty",
        COALESCE(SUM(CASE WHEN "occurredAt" >= ${start} AND "direction" = 'OUT' THEN "quantity" * COALESCE("unitCost", 0) END), 0)::float8 AS "outValue"
      FROM "StockMovement"
      WHERE "companyId" = ${ctx.scope.companyId} AND "siteId" = ANY(${ctx.scope.siteIds}) AND "occurredAt" < ${end}
      GROUP BY "siteId", "productId"
    `;
    const products = await this.products(ctx.scope.companyId, rows.map((row) => row.productId));
    const listed = rows
      .filter((row) => [row.openingQty, row.inQty, row.outQty].some((qty) => round3(qty) !== 0))
      .filter((row) => this.productInGroup(products.get(row.productId), ctx.query.groupId))
      .map((row) => ({ ...row, product: products.get(row.productId)! }))
      .sort(
        (a, b) =>
          (ctx.scope.siteName.get(a.siteId) ?? '').localeCompare(ctx.scope.siteName.get(b.siteId) ?? '') ||
          a.product.name.localeCompare(b.product.name),
      );
    const sum = (pick: (row: (typeof listed)[number]) => number) => round2(listed.reduce((total, row) => total + pick(row), 0));
    return {
      columns: [
        ...(ctx.scope.multi ? ['site'] : []),
        'code', 'product', 'unit', 'openingQty', 'openingValue', 'inQty', 'inValue', 'outQty', 'outValue', 'closingQty', 'closingValue',
      ],
      rows: listed.map((row) => ({
        site: ctx.scope.siteName.get(row.siteId) ?? '',
        ...this.productCells(row.product, ctx.lang),
        openingQty: round3(row.openingQty),
        openingValue: round2(row.openingValue),
        inQty: round3(row.inQty),
        inValue: round2(row.inValue),
        outQty: round3(row.outQty),
        outValue: round2(row.outValue),
        closingQty: round3(row.openingQty + row.inQty - row.outQty),
        closingValue: round2(row.openingValue + row.inValue - row.outValue),
        _productId: row.productId,
      })),
      totals: {
        product: this.text('total', ctx.lang),
        openingValue: sum((row) => row.openingValue),
        inValue: sum((row) => row.inValue),
        outValue: sum((row) => row.outValue),
        closingValue: sum((row) => row.openingValue + row.inValue - row.outValue),
      },
      notes: [],
      from,
      to,
    };
  }

  /** One product: every movement in the period with a running balance, opening balance first. */
  private async movementJournal(ctx: Ctx, productId: string): Promise<Built> {
    const { from, to } = this.period(ctx.query);
    const { start, end } = businessRange(from, to);
    const product = (await this.products(ctx.scope.companyId, [productId])).get(productId);
    if (!product) throw new NotFoundException('Product not found');
    const where = { companyId: ctx.scope.companyId, productId, siteId: { in: ctx.scope.siteIds } };
    const [before, movements] = await Promise.all([
      this.prisma.stockMovement.groupBy({ by: ['direction'], where: { ...where, occurredAt: { lt: start } }, _sum: { quantity: true } }),
      this.prisma.stockMovement.findMany({
        where: { ...where, occurredAt: { gte: start, lt: end } },
        orderBy: [{ occurredAt: 'asc' }, { createdAt: 'asc' }],
        take: JOURNAL_LIMIT + 1,
        select: {
          siteId: true,
          direction: true,
          quantity: true,
          unitCost: true,
          occurredAt: true,
          batch: { select: { batchNumber: true } },
          document: {
            select: {
              id: true,
              type: true,
              number: true,
              direction: true,
              siteId: true,
              site: { select: { name: true } },
              targetSite: { select: { name: true } },
              partner: { select: { name: true } },
            },
          },
        },
      }),
    ]);
    const opening = round3(
      before.reduce((sum, row) => sum + (row.direction === 'IN' ? 1 : -1) * toNumber(row._sum.quantity ?? 0), 0),
    );
    const capped = movements.length > JOURNAL_LIMIT;
    const shown = movements.slice(0, JOURNAL_LIMIT);
    const signed = shown.map((row) => (row.direction === 'IN' ? 1 : -1) * toNumber(row.quantity));
    const balances = runningBalances(opening, signed);
    let inQty = 0;
    let outQty = 0;
    let inValue = 0;
    let outValue = 0;

    const rows: ReportRow[] = shown.map((row, index) => {
      const quantity = toNumber(row.quantity);
      const unitCost = row.unitCost === null ? null : toNumber(row.unitCost);
      const value = unitCost === null ? null : quantity * unitCost;
      if (row.direction === 'IN') {
        inQty += quantity;
        inValue += value ?? 0;
      } else {
        outQty += quantity;
        outValue += value ?? 0;
      }
      const doc = row.document;
      const partner =
        doc?.type === 'TRANSFER'
          ? row.siteId === doc.siteId
            ? (doc.targetSite?.name ?? null)
            : doc.site.name
          : (doc?.partner?.name ?? null);
      return {
        date: businessDate(row.occurredAt),
        site: ctx.scope.siteName.get(row.siteId) ?? '',
        documentType: doc ? this.documentTypeLabel(doc.type as DocumentType, doc.type === 'SALE' && doc.direction === 'IN', ctx.lang) : null,
        number: doc?.number ?? null,
        partner,
        batch: row.batch?.batchNumber ?? null,
        inQty: row.direction === 'IN' ? quantity : null,
        outQty: row.direction === 'OUT' ? quantity : null,
        unitCost: unitCost === null ? null : round4(unitCost),
        inValue: row.direction === 'IN' && value !== null ? round2(value) : null,
        outValue: row.direction === 'OUT' && value !== null ? round2(value) : null,
        balance: balances[index],
        _documentId: doc?.id ?? null,
        _documentType: doc?.type ?? null,
      };
    });
    const closing = balances.length ? balances[balances.length - 1] : opening;
    return {
      columns: [
        'date', ...(ctx.scope.multi ? ['site'] : []),
        'documentType', 'number', 'partner', 'batch', 'inQty', 'outQty', 'unitCost', 'inValue', 'outValue', 'balance',
      ],
      rows: [{ date: from, documentType: this.text('opening', ctx.lang), balance: opening }, ...rows],
      totals: {
        documentType: `${this.text('total', ctx.lang)} — ${product.code} ${product.name} (${this.unitLabel(product.unit, ctx.lang)})`,
        inQty: round3(inQty),
        outQty: round3(outQty),
        inValue: round2(inValue),
        outValue: round2(outValue),
        balance: closing,
      },
      notes: capped ? [this.text('journalCapped', ctx.lang)] : [],
      from,
      to,
    };
  }

  // ─── Write-offs and stocktakes ────────────────────────────────────────────

  private async writeOffs(ctx: Ctx): Promise<Built> {
    const { from, to } = this.period(ctx.query);
    const view = ctx.query.view ?? 'line';
    const docs = await this.prisma.document.findMany({
      where: {
        companyId: ctx.scope.companyId,
        siteId: { in: ctx.scope.siteIds },
        type: 'WRITE_OFF',
        status: 'POSTED',
        ...STANDING_DOCUMENT,
        ...(ctx.query.reason ? { writeOffReason: ctx.query.reason } : {}),
        issuedOn: { gte: dateValue(from), lte: dateValue(to) },
      },
      orderBy: [{ issuedOn: 'asc' }, { number: 'asc' }],
      select: {
        id: true,
        number: true,
        issuedOn: true,
        siteId: true,
        writeOffReason: true,
        notes: true,
        createdBy: { select: { name: true } },
        lines: {
          orderBy: { position: 'asc' },
          select: {
            productId: true,
            quantity: true,
            unitPrice: true,
            finalUnitPrice: true,
            lineTotal: true,
            batch: { select: { batchNumber: true } },
          },
        },
      },
    });
    const products = await this.products(
      ctx.scope.companyId,
      docs.flatMap((doc) => doc.lines.flatMap((line) => (line.productId ? [line.productId] : []))),
    );
    const lines = docs.flatMap((doc) =>
      doc.lines
        .filter((line) => line.productId && this.productInGroup(products.get(line.productId), ctx.query.groupId))
        .map((line) => {
          const quantity = toNumber(line.quantity);
          const unitCost = toNumber(line.finalUnitPrice ?? line.unitPrice);
          return {
            doc,
            productId: line.productId!,
            product: products.get(line.productId!)!,
            batch: line.batch?.batchNumber ?? null,
            quantity,
            unitCost,
            value: line.lineTotal !== null ? toNumber(line.lineTotal) : quantity * unitCost,
          };
        }),
    );
    const total = lines.reduce((sum, line) => sum + line.value, 0);
    const reasonLabel = (reason: WriteOffReason | null) => (reason ? WRITE_OFF_REASON_LABELS[reason][ctx.lang] : '');

    if (view === 'reason' || view === 'product') {
      const groups = new Map<string, { label: ReportRow; documents: Set<string>; lines: number; quantity: number; value: number }>();
      for (const line of lines) {
        const key = view === 'reason' ? (line.doc.writeOffReason ?? '') : line.productId;
        const label: ReportRow =
          view === 'reason' ? { reason: reasonLabel(line.doc.writeOffReason) } : this.productCells(line.product, ctx.lang);
        const group = groups.get(key) ?? { label, documents: new Set<string>(), lines: 0, quantity: 0, value: 0 };
        group.documents.add(line.doc.id);
        group.lines += 1;
        group.quantity += line.quantity;
        group.value += line.value;
        groups.set(key, group);
      }
      const sorted = [...groups.values()].sort((a, b) => b.value - a.value);
      return {
        columns:
          view === 'reason'
            ? ['reason', 'documents', 'lines', 'value', 'share']
            : ['code', 'product', 'group', 'unit', 'quantity', 'value', 'lines', 'share'],
        rows: sorted.map((group) => ({
          ...group.label,
          documents: group.documents.size,
          lines: group.lines,
          ...(view === 'product' ? { quantity: round3(group.quantity) } : {}),
          value: round2(group.value),
          share: sharePercent(group.value, total),
        })),
        totals: {
          [view === 'reason' ? 'reason' : 'product']: this.text('total', ctx.lang),
          documents: docs.length,
          lines: lines.length,
          value: round2(total),
        },
        notes: [],
        from,
        to,
      };
    }

    return {
      columns: [
        'date', 'number', ...(ctx.scope.multi ? ['site'] : []),
        'reason', 'code', 'product', 'batch', 'unit', 'quantity', 'unitCost', 'value', 'note', 'createdBy',
      ],
      rows: lines.map((line) => ({
        date: isoDate(line.doc.issuedOn),
        number: line.doc.number,
        site: ctx.scope.siteName.get(line.doc.siteId) ?? '',
        reason: reasonLabel(line.doc.writeOffReason),
        ...this.productCells(line.product, ctx.lang),
        batch: line.batch,
        quantity: round3(line.quantity),
        unitCost: round4(line.unitCost),
        value: round2(line.value),
        note: line.doc.notes,
        createdBy: line.doc.createdBy?.name ?? null,
        _documentId: line.doc.id,
        _documentType: 'WRITE_OFF',
      })),
      totals: { date: this.text('total', ctx.lang), value: round2(total) },
      notes: [],
      from,
      to,
    };
  }

  private async stocktakeVariances(ctx: Ctx): Promise<Built> {
    const { from, to } = this.period(ctx.query);
    const docs = await this.prisma.document.findMany({
      where: {
        companyId: ctx.scope.companyId,
        siteId: { in: ctx.scope.siteIds },
        type: 'STOCKTAKE',
        status: 'POSTED',
        ...STANDING_DOCUMENT,
        issuedOn: { gte: dateValue(from), lte: dateValue(to) },
      },
      orderBy: [{ issuedOn: 'asc' }, { number: 'asc' }],
      select: {
        id: true,
        number: true,
        issuedOn: true,
        siteId: true,
        lines: {
          where: { countedQuantity: { not: null } },
          orderBy: { position: 'asc' },
          select: {
            productId: true,
            countedQuantity: true,
            expectedQuantity: true,
            unitPrice: true,
            lineTotal: true,
            batch: { select: { batchNumber: true } },
          },
        },
      },
    });
    const products = await this.products(
      ctx.scope.companyId,
      docs.flatMap((doc) => doc.lines.flatMap((line) => (line.productId ? [line.productId] : []))),
    );
    let surplus = 0;
    let shortage = 0;
    const rows: ReportRow[] = [];
    for (const doc of docs) {
      for (const line of doc.lines) {
        if (!line.productId || !this.productInGroup(products.get(line.productId), ctx.query.groupId)) continue;
        const expected = toNumber(line.expectedQuantity ?? 0);
        const counted = toNumber(line.countedQuantity!);
        const variance = round3(counted - expected);
        if (variance === 0 && !ctx.query.includeMatches) continue;
        const unitCost = toNumber(line.unitPrice);
        const value = line.lineTotal !== null ? toNumber(line.lineTotal) : variance * unitCost;
        if (value > 0) surplus += value;
        else shortage += value;
        rows.push({
          date: isoDate(doc.issuedOn),
          number: doc.number,
          site: ctx.scope.siteName.get(doc.siteId) ?? '',
          ...this.productCells(products.get(line.productId)!, ctx.lang),
          batch: line.batch?.batchNumber ?? null,
          expected: round3(expected),
          counted: round3(counted),
          variance,
          unitCost: round4(unitCost),
          varianceValue: round2(value),
          _documentId: doc.id,
          _documentType: 'STOCKTAKE',
        });
      }
    }
    return {
      columns: [
        'date', 'number', ...(ctx.scope.multi ? ['site'] : []),
        'code', 'product', 'batch', 'unit', 'expected', 'counted', 'variance', 'unitCost', 'varianceValue',
      ],
      rows,
      totals: { date: this.text('total', ctx.lang), varianceValue: round2(surplus + shortage) },
      notes: [
        `${this.text('surplus', ctx.lang)}: ${this.money(surplus, ctx.lang)} · ${this.text('shortage', ctx.lang)}: ${this.money(shortage, ctx.lang)}`,
      ],
      from,
      to,
    };
  }

  // ─── VAT ───────────────────────────────────────────────────────────────────

  private async vatSummary(ctx: Ctx): Promise<Built> {
    const { from, to } = this.period(ctx.query);
    const entries = await this.vatEntries(ctx, from, to);
    const rows: ReportRow[] = [];
    for (const section of ['purchases', 'sales'] as const) {
      const byRate = new Map<string, RateAmounts & { documents: number }>();
      let documents = 0;
      for (const entry of entries.filter((item) => item.section === section)) {
        documents += entry.documents;
        for (const [key, amounts] of entry.rates) {
          const row = byRate.get(key) ?? { rate: amounts.rate, net: 0, vat: 0, documents: 0 };
          row.net += amounts.net;
          row.vat += amounts.vat;
          row.documents += entry.documents;
          byRate.set(key, row);
        }
      }
      const label = this.text(section, ctx.lang);
      const sorted = [...byRate.values()].sort((a, b) => b.rate - a.rate);
      for (const row of sorted) {
        rows.push({ section: label, rate: `${rateKey(row.rate)}%`, documents: row.documents, ...this.vatCells(row.net, row.vat) });
      }
      rows.push({
        section: label,
        rate: this.text(section === 'purchases' ? 'purchasesTotal' : 'salesTotal', ctx.lang),
        documents,
        ...this.vatCells(
          sorted.reduce((sum, row) => sum + row.net, 0),
          sorted.reduce((sum, row) => sum + row.vat, 0),
        ),
        _total: 1,
      });
    }
    return {
      columns: ['section', 'rate', 'documents', 'net', 'vat', 'total'],
      rows,
      totals: null,
      notes: [this.text('purchaseNet', ctx.lang), this.text('salesGross', ctx.lang)],
      from,
      to,
    };
  }

  private async vatJournal(ctx: Ctx): Promise<Built> {
    const { from, to } = this.period(ctx.query);
    const entries = await this.vatEntries(ctx, from, to);
    const rates = [...new Map(entries.flatMap((entry) => [...entry.rates.values()].map((item) => [rateKey(item.rate), item.rate] as const))).values()]
      .sort((a, b) => b - a)
      .map(rateKey);
    const rows: ReportRow[] = [];
    for (const section of ['purchases', 'sales'] as const) {
      const label = this.text(section, ctx.lang);
      const subtotal = new Map<string, { net: number; vat: number }>();
      for (const entry of entries.filter((item) => item.section === section)) {
        const row: ReportRow = {
          section: label,
          date: entry.date,
          documentType: entry.documentType,
          number: entry.number,
          partner: entry.partner,
          partnerTaxId: entry.partnerTaxId,
          site: ctx.scope.siteName.get(entry.siteId) ?? '',
          _documentId: entry.documentId,
          _documentType: entry.documentId ? 'PURCHASE' : null,
        };
        let net = 0;
        let vat = 0;
        for (const [key, amounts] of entry.rates) {
          row[`net_${key}`] = round2(amounts.net);
          row[`vat_${key}`] = round2(amounts.vat);
          net += amounts.net;
          vat += amounts.vat;
          const sum = subtotal.get(key) ?? { net: 0, vat: 0 };
          sum.net += amounts.net;
          sum.vat += amounts.vat;
          subtotal.set(key, sum);
        }
        rows.push({ ...row, ...this.vatCells(net, vat) });
      }
      const totalRow: ReportRow = { section: label, documentType: this.text(section === 'purchases' ? 'purchasesTotal' : 'salesTotal', ctx.lang), _total: 1 };
      for (const [key, sum] of subtotal) {
        totalRow[`net_${key}`] = round2(sum.net);
        totalRow[`vat_${key}`] = round2(sum.vat);
      }
      const values = [...subtotal.values()];
      rows.push({
        ...totalRow,
        ...this.vatCells(
          values.reduce((total, item) => total + item.net, 0),
          values.reduce((total, item) => total + item.vat, 0),
        ),
      });
    }
    return {
      columns: [
        'section', 'date', 'documentType', 'number', 'partner', 'partnerTaxId', ...(ctx.scope.multi ? ['site'] : []),
        ...rates.flatMap((key) => [`net_${key}`, `vat_${key}`]), 'net', 'vat', 'total',
      ],
      rows,
      totals: null,
      notes: [this.text('purchaseNet', ctx.lang), this.text('salesGross', ctx.lang)],
      from,
      to,
    };
  }

  /**
   * Purchases: one entry per posted invoice or credit/debit note; prices exclude VAT and VAT is charged per
   * rate on each document. Stock going back out (a credit note) counts negative. A receipt note is not a tax
   * document: the same delivery's invoice carries the VAT, so counting both would claim it twice.
   * Sales: till receipts summed per day and site (voids negative); gross prices are split per rate.
   */
  private async vatEntries(ctx: Ctx, from: string, to: string): Promise<VatEntry[]> {
    const [purchases, sales] = await Promise.all([
      this.prisma.document.findMany({
        where: {
          companyId: ctx.scope.companyId,
          siteId: { in: ctx.scope.siteIds },
          status: 'POSTED',
          type: { in: ['INVOICE', 'CREDIT_NOTE'] },
          ...STANDING_DOCUMENT,
          issuedOn: { gte: dateValue(from), lte: dateValue(to) },
        },
        orderBy: [{ issuedOn: 'asc' }, { number: 'asc' }],
        select: {
          id: true,
          type: true,
          direction: true,
          number: true,
          issuedOn: true,
          siteId: true,
          partner: { select: { name: true, eik: true, vatNumber: true } },
          lines: { select: { quantity: true, unitPrice: true, finalUnitPrice: true, lineTotal: true, vatRate: true } },
        },
      }),
      this.saleFacts(ctx, from, to),
    ]);

    const entries: VatEntry[] = [];
    for (const doc of purchases) {
      const sign = doc.direction === 'IN' ? 1 : -1;
      const nets = new Map<string, { rate: number; net: number }>();
      for (const line of doc.lines) {
        const rate = toNumber(line.vatRate);
        const net = line.lineTotal !== null ? toNumber(line.lineTotal) : toNumber(line.quantity) * toNumber(line.finalUnitPrice ?? line.unitPrice);
        const item = nets.get(rateKey(rate)) ?? { rate, net: 0 };
        item.net += sign * net;
        nets.set(rateKey(rate), item);
      }
      if (nets.size === 0) continue;
      entries.push({
        section: 'purchases',
        date: isoDate(doc.issuedOn),
        documentType: this.documentTypeLabel(doc.type as DocumentType, false, ctx.lang),
        number: doc.number,
        partner: doc.partner?.name ?? null,
        partnerTaxId: partnerTaxNumber(doc.partner),
        siteId: doc.siteId,
        documents: 1,
        rates: new Map(
          [...nets].map(([key, item]) => {
            const net = round2(item.net);
            return [key, { rate: item.rate, net, vat: round2((net * item.rate) / 100) }];
          }),
        ),
        documentId: doc.id,
      });
    }

    const days = new Map<string, { date: string; siteId: string; numbers: Set<string>; gross: Map<string, { rate: number; gross: number }> }>();
    for (const fact of sales) {
      const key = `${fact.date}|${fact.siteId}`;
      const day = days.get(key) ?? { date: fact.date, siteId: fact.siteId, numbers: new Set<string>(), gross: new Map() };
      day.numbers.add(fact.number);
      const item = day.gross.get(rateKey(fact.vatRate)) ?? { rate: fact.vatRate, gross: 0 };
      item.gross += fact.sign * fact.gross;
      day.gross.set(rateKey(fact.vatRate), item);
      days.set(key, day);
    }
    const sortedDays = [...days.values()].sort(
      (a, b) => a.date.localeCompare(b.date) || (ctx.scope.siteName.get(a.siteId) ?? '').localeCompare(ctx.scope.siteName.get(b.siteId) ?? ''),
    );
    for (const day of sortedDays) {
      const numbers = [...day.numbers].sort();
      entries.push({
        section: 'sales',
        date: day.date,
        documentType: this.text('tillSales', ctx.lang),
        number: numbers.length > 1 ? `${numbers[0]} – ${numbers[numbers.length - 1]}` : numbers[0],
        partner: `${numbers.length} ${this.text('receiptsRange', ctx.lang)}`,
        partnerTaxId: null,
        siteId: day.siteId,
        documents: numbers.length,
        rates: new Map(
          [...day.gross].map(([key, item]) => {
            const gross = round2(item.gross);
            const net = round2(splitGross(gross, item.rate).net);
            return [key, { rate: item.rate, net, vat: round2(gross - net) }];
          }),
        ),
        documentId: null,
      });
    }
    return entries;
  }

  // ─── Shared loaders and cells ─────────────────────────────────────────────

  private async saleFacts(ctx: Ctx, from: string, to: string): Promise<SaleFact[]> {
    const { start, end } = businessRange(from, to);
    const docs = await this.prisma.document.findMany({
      where: {
        companyId: ctx.scope.companyId,
        siteId: { in: ctx.scope.siteIds },
        type: 'SALE',
        status: 'POSTED',
        postedAt: { gte: start, lt: end },
      },
      orderBy: { postedAt: 'asc' },
      select: {
        id: true,
        number: true,
        siteId: true,
        direction: true,
        postedAt: true,
        lines: {
          select: {
            productId: true,
            quantity: true,
            lineTotal: true,
            vatRate: true,
            movements: { select: { quantity: true, unitCost: true } },
          },
        },
      },
    });
    const products = await this.products(
      ctx.scope.companyId,
      docs.flatMap((doc) => doc.lines.flatMap((line) => (line.productId ? [line.productId] : []))),
    );
    return docs.flatMap((doc) =>
      doc.lines
        .filter((line) => line.productId && products.has(line.productId))
        .map((line) => ({
          documentId: doc.id,
          number: doc.number,
          siteId: doc.siteId,
          date: businessDate(doc.postedAt!),
          sign: doc.direction === 'OUT' ? (1 as const) : (-1 as const),
          productId: line.productId!,
          product: products.get(line.productId!)!,
          quantity: toNumber(line.quantity),
          gross: toNumber(line.lineTotal ?? 0),
          vatRate: toNumber(line.vatRate),
          cost:
            line.movements.length === 0 || line.movements.some((movement) => movement.unitCost === null)
              ? null
              : line.movements.reduce((sum, movement) => sum + toNumber(movement.quantity) * toNumber(movement.unitCost!), 0),
        })),
    );
  }

  private async products(companyId: string, ids: string[]) {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return new Map<string, ProductInfo>();
    const rows = await this.prisma.product.findMany({
      where: { companyId, id: { in: unique } },
      select: { id: true, code: true, name: true, unit: true, sellingPrice: true, groupId: true, group: { select: { name: true } } },
    });
    return new Map<string, ProductInfo>(
      rows.map((row) => [
        row.id,
        {
          code: row.code,
          name: row.name,
          unit: row.unit,
          sellingPrice: row.sellingPrice === null ? null : toNumber(row.sellingPrice),
          groupId: row.groupId,
          groupName: row.group?.name ?? null,
        },
      ]),
    );
  }

  private inGroup(facts: SaleFact[], groupId?: string) {
    return groupId ? facts.filter((fact) => fact.product.groupId === groupId) : facts;
  }

  private productInGroup(product: ProductInfo | undefined, groupId?: string) {
    return Boolean(product) && (!groupId || product!.groupId === groupId);
  }

  private productCells(product: ProductInfo, lang: ReportLang): ReportRow {
    return {
      code: product.code,
      product: product.name,
      group: product.groupName ?? this.text('noGroup', lang),
      unit: this.unitLabel(product.unit, lang),
    };
  }

  private profitCells(gross: number, net: number, cost: number, withVat = true): ReportRow {
    const profit = net - cost;
    return {
      gross: round2(gross),
      net: round2(net),
      ...(withVat ? { vat: round2(gross - net) } : {}),
      cost: round2(cost),
      profit: round2(profit),
      margin: marginPercent(net, profit),
    };
  }

  private vatCells(net: number, vat: number): ReportRow {
    return { net: round2(net), vat: round2(vat), total: round2(net + vat) };
  }

  private documentTypeLabel(type: DocumentType, isVoid: boolean, lang: ReportLang) {
    const label = REPORT_DOCUMENT_TYPE_LABELS[type]?.[lang] ?? type;
    return isVoid ? `${label} ${this.text('voidSuffix', lang)}` : label;
  }

  private unitLabel(unit: string, lang: ReportLang) {
    return REPORT_UNIT_LABELS[unit]?.[lang] ?? unit;
  }

  private text(key: keyof typeof REPORT_TEXT, lang: ReportLang) {
    return REPORT_TEXT[key][lang];
  }

  private money(value: number, lang: ReportLang) {
    return new Intl.NumberFormat(lang === 'bg' ? 'bg-BG' : 'en-GB', { style: 'currency', currency: 'EUR' }).format(round2(value));
  }

  /** from–to as local business dates; defaults to this month so far. */
  period(query: { from?: string; to?: string }) {
    const to = query.to ?? businessDate();
    const from = query.from ?? `${to.slice(0, 7)}-01`;
    if (!isBusinessDate(from) || !isBusinessDate(to)) throw new BadRequestException('Dates must be valid YYYY-MM-DD');
    if (from > to) throw new BadRequestException('from must not be after to');
    if (daysBetween(from, to) >= MAX_REPORT_PERIOD_DAYS) {
      throw new BadRequestException(`A report covers at most ${MAX_REPORT_PERIOD_DAYS} days`);
    }
    return { from, to };
  }
}