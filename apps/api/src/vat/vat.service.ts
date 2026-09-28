import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  BUSINESS_TIME_ZONE,
  VAT_DOCUMENT_TYPES,
  VAT_PURCHASE_FIELD_LABELS,
  VAT_PURCHASE_FIELDS,
  VAT_RETURN_CELL_LABELS,
  VAT_RETURN_SECTIONS,
  VAT_SALES_FIELD_LABELS,
  VAT_SALES_FIELDS,
  hasBlockingIssues,
  isVatPeriod,
  shiftVatPeriod,
  vatPeriodOf,
  vatPeriodRange,
  type AuthUser,
  type ComplianceIssue,
  type ReportCell,
  type ReportLang,
  type VatCredit,
  type VatEntryRecord,
  type VatLedger,
  type VatLedgerRow,
  type VatPeriodView,
  type VatReturnInputs,
  type VatSalesGrouping,
  type VatSettingsRecord,
} from '@skladnik/shared';
import { toNumber } from '../common/decimal';
import { ComplianceFilingsService } from '../compliance/filings.service';
import { stableHash } from '../compliance/hash';
import { isValidBgVatNumber, normaliseTaxId } from '../compliance/identifiers';
import { PrismaService } from '../prisma/prisma.service';
import { buildXlsx, type XlsxColumn } from '../reports/export/xlsx';
import { round2 } from '../reports/report-math';
import { businessDate, businessRange } from '../sales/business-day';
import type { VatDocumentTreatmentDto, VatEntryDto, VatExportQueryDto, VatReturnInputsDto, VatSettingsDto, VatSubmittedDto } from './dto/vat.dto';
import { nraFiles } from './nra-format';
import { buildVatPeriod, documentLabel, fileContent, purchaseRow, type PurchaseDocInput, type TillSaleInput } from './vat-ledger';

const KIND = 'VAT_RETURN' as const;
const MAX_AMOUNT = 999_999_999_999;
const isoDate = (value: Date) => value.toISOString().slice(0, 10);
const dateValue = (value: string) => new Date(`${value}T00:00:00Z`);

const TEXT: Record<string, Record<ReportLang, string>> = {
  purchases: { en: 'Purchase ledger', bg: 'Дневник за покупките' },
  sales: { en: 'Sales ledger', bg: 'Дневник за продажбите' },
  return: { en: 'VAT return', bg: 'Справка-декларация по ЗДДС' },
  period: { en: 'Tax period', bg: 'Данъчен период' },
  vatNumber: { en: 'VAT number', bg: 'ДДС номер' },
  generated: { en: 'Generated', bg: 'Генерирано' },
  seq: { en: 'No.', bg: '№ по ред' },
  type: { en: 'Document type', bg: 'Вид на документа' },
  number: { en: 'Document number', bg: 'Номер на документа' },
  date: { en: 'Date', bg: 'Дата' },
  partnerTaxId: { en: 'Counterparty ID', bg: 'ИН на контрагента' },
  partnerName: { en: 'Counterparty', bg: 'Име на контрагента' },
  description: { en: 'Goods or services', bg: 'Вид на стоката / услугата' },
  cell: { en: 'Cell', bg: 'Клетка' },
  cellDescription: { en: 'Description', bg: 'Описание' },
  amount: { en: 'Amount', bg: 'Сума' },
  total: { en: 'Total', bg: 'Общо' },
  notFiled: { en: 'Draft — not generated as a filing.', bg: 'Чернова — не е генерирана за подаване.' },
};

type VatSettingsRow = Prisma.VatSettingsGetPayload<object>;

const PURCHASE_SELECT = {
  id: true,
  type: true,
  direction: true,
  number: true,
  issuedOn: true,
  postedAt: true,
  vatCredit: true,
  vatPeriod: true,
  site: { select: { name: true } },
  partner: { select: { name: true, taxId: true } },
  lines: { select: { quantity: true, unitPrice: true, finalUnitPrice: true, lineTotal: true, vatRate: true } },
} satisfies Prisma.DocumentSelect;

type PurchaseDocRow = Prisma.DocumentGetPayload<{ select: typeof PURCHASE_SELECT }>;

/** VAT ledgers and the monthly return (spec §4.7b). Company-wide; OWNER and ACCOUNTANT only. */
@Injectable()
export class VatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly filings: ComplianceFilingsService,
  ) {}

  // ─── Settings ─────────────────────────────────────────────────────────────

  async settings(companyId: string): Promise<VatSettingsRecord> {
    const [company, row] = await Promise.all([
      this.prisma.company.findUniqueOrThrow({ where: { id: companyId }, select: { name: true } }),
      this.prisma.vatSettings.findUnique({ where: { companyId } }),
    ]);
    return this.settingsRecord(company.name, row);
  }

  async saveSettings(user: AuthUser, dto: VatSettingsDto) {
    let vatNumber = dto.vatNumber ? normaliseTaxId(dto.vatNumber) : null;
    if (vatNumber && /^\d{9,10}$/.test(vatNumber)) vatNumber = `BG${vatNumber}`;
    if (vatNumber && !isValidBgVatNumber(vatNumber)) throw new BadRequestException(`${vatNumber} is not a valid Bulgarian VAT number.`);
    const data = {
      vatNumber,
      legalName: dto.legalName,
      declarant: dto.declarant,
      branch: dto.branch,
      salesGrouping: dto.salesGrouping,
      coefficient: new Prisma.Decimal(dto.coefficient),
    };
    await this.prisma.vatSettings.upsert({ where: { companyId: user.companyId }, create: { companyId: user.companyId, ...data }, update: data });
    await this.log(user, 'VatSettings', user.companyId, 'UPDATE', { vatNumber, salesGrouping: dto.salesGrouping });
    return this.settings(user.companyId);
  }

  private settingsRecord(companyName: string, row: VatSettingsRow | null): VatSettingsRecord {
    return {
      vatNumber: row?.vatNumber ?? null,
      legalName: row?.legalName ?? null,
      declarant: row?.declarant ?? null,
      branch: row?.branch ?? 0,
      salesGrouping: (row?.salesGrouping as VatSalesGrouping | undefined) ?? 'MONTH',
      coefficient: row ? toNumber(row.coefficient) : 0,
      companyName,
    };
  }

  // ─── Period view ──────────────────────────────────────────────────────────

  async period(user: AuthUser, period: string): Promise<VatPeriodView> {
    const computed = await this.compute(user.companyId, this.checkPeriod(period));
    return computed.view;
  }

  async saveInputs(user: AuthUser, period: string, dto: VatReturnInputsDto) {
    this.checkPeriod(period);
    const data = {
      coefficient: dto.coefficient === null ? null : new Prisma.Decimal(dto.coefficient),
      cell70: new Prisma.Decimal(dto.cell70),
      cell71: new Prisma.Decimal(dto.cell71),
      cell80: new Prisma.Decimal(dto.cell80),
      cell81: new Prisma.Decimal(dto.cell81),
      cell82: new Prisma.Decimal(dto.cell82),
    };
    await this.prisma.vatReturnInput.upsert({
      where: { companyId_period: { companyId: user.companyId, period } },
      create: { companyId: user.companyId, period, ...data },
      update: data,
    });
    await this.log(user, 'VatReturnInput', period, 'UPDATE', { ...dto });
    return this.period(user, period);
  }

  private checkPeriod(period: string) {
    if (!isVatPeriod(period)) throw new BadRequestException('The period must be YYYY-MM.');
    return period;
  }

  private async compute(companyId: string, period: string) {
    const range = vatPeriodRange(period);
    const today = businessDate();
    const sales = businessRange(range.from, range.to);
    const [company, settingsRow, sites, documents, saleDocs, entryRows, inputsRow, filings, unposted, receipts] = await Promise.all([
      this.prisma.company.findUniqueOrThrow({ where: { id: companyId }, select: { name: true } }),
      this.prisma.vatSettings.findUnique({ where: { companyId } }),
      this.prisma.site.findMany({ where: { companyId }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], select: { id: true, name: true } }),
      this.prisma.document.findMany({
        where: {
          companyId,
          status: 'POSTED',
          type: { in: ['INVOICE', 'CREDIT_NOTE'] },
          OR: [{ vatPeriod: period }, { vatPeriod: null, issuedOn: { gte: dateValue(range.from), lte: dateValue(range.to) } }],
        },
        select: PURCHASE_SELECT,
      }),
      this.prisma.document.findMany({
        where: { companyId, type: 'SALE', status: 'POSTED', postedAt: { gte: sales.start, lt: sales.end } },
        select: { siteId: true, direction: true, postedAt: true, lines: { select: { lineTotal: true, vatRate: true } } },
      }),
      this.prisma.vatLedgerEntry.findMany({ where: { companyId, period }, orderBy: [{ issuedOn: 'asc' }, { createdAt: 'asc' }] }),
      this.prisma.vatReturnInput.findUnique({ where: { companyId_period: { companyId, period } } }),
      this.filings.list(companyId, KIND, period),
      this.prisma.document.count({
        where: {
          companyId,
          status: { in: ['DRAFT', 'REVIEW'] },
          type: { in: ['INVOICE', 'CREDIT_NOTE'] },
          OR: [{ vatPeriod: period }, { vatPeriod: null, issuedOn: { gte: dateValue(range.from), lte: dateValue(range.to) } }],
        },
      }),
      this.prisma.document.count({
        where: { companyId, status: 'POSTED', type: 'RECEIPT', issuedOn: { gte: dateValue(range.from), lte: dateValue(range.to) } },
      }),
    ]);

    const settings = this.settingsRecord(company.name, settingsRow);
    const siteInfo = new Map(sites.map((site, index) => [site.id, { name: site.name, number: index + 1 }]));
    const till: TillSaleInput[] = saleDocs.flatMap((doc) => {
      const site = siteInfo.get(doc.siteId)!;
      const sign = doc.direction === 'OUT' ? 1 : -1;
      return doc.lines.map((line) => ({
        siteId: doc.siteId,
        siteName: site.name,
        siteNumber: site.number,
        date: businessDate(doc.postedAt!),
        rate: toNumber(line.vatRate),
        gross: sign * toNumber(line.lineTotal ?? 0),
      }));
    });
    const inputs: VatReturnInputs = {
      coefficient: inputsRow?.coefficient != null ? toNumber(inputsRow.coefficient) : null,
      cell70: inputsRow ? toNumber(inputsRow.cell70) : 0,
      cell71: inputsRow ? toNumber(inputsRow.cell71) : 0,
      cell80: inputsRow ? toNumber(inputsRow.cell80) : 0,
      cell81: inputsRow ? toNumber(inputsRow.cell81) : 0,
      cell82: inputsRow ? toNumber(inputsRow.cell82) : 0,
    };

    const built = buildVatPeriod({
      period,
      today,
      settings,
      documents: documents.map((doc) => this.purchaseInput(doc)),
      till,
      entries: entryRows.map((row) => this.entryRecord(row)),
      inputs,
    });
    const issues: ComplianceIssue[] = [...built.issues];
    if (unposted > 0) issues.push({ severity: 'warning', code: 'UNPOSTED_DOCUMENTS', params: { count: unposted }, ref: { kind: 'period', period } });
    if (receipts > 0) issues.push({ severity: 'info', code: 'RECEIPTS_NOT_TAX_DOCUMENTS', params: { count: receipts }, ref: { kind: 'period', period } });
    issues.push(...(await this.lateDocuments(companyId, period)));

    const sourceHash = stableHash(fileContent(built.header, built.purchases, built.sales, built.cells));
    const latest = filings[0] ?? null;
    const changedSinceFiling = latest !== null && latest.sourceHash !== sourceHash;
    if (changedSinceFiling) issues.push({ severity: 'warning', code: 'CHANGED_SINCE_FILING', params: { version: latest.version }, ref: { kind: 'period', period } });

    const order = { error: 0, warning: 1, info: 2 };
    issues.sort((a, b) => order[a.severity] - order[b.severity]);
    const view: VatPeriodView = {
      period,
      settings,
      purchases: built.purchases,
      sales: built.sales,
      excluded: built.excluded,
      cells: built.cells,
      inputs,
      issues,
      filings,
      sourceHash,
      changedSinceFiling,
    };
    return { view, header: built.header };
  }

  private purchaseInput(doc: PurchaseDocRow): PurchaseDocInput {
    return {
      id: doc.id,
      type: doc.type as PurchaseDocInput['type'],
      direction: doc.direction,
      number: doc.number,
      issuedOn: isoDate(doc.issuedOn),
      siteName: doc.site.name,
      partnerName: doc.partner?.name ?? null,
      partnerTaxId: doc.partner?.taxId ?? null,
      lines: doc.lines.map((line) => ({
        net: line.lineTotal !== null ? toNumber(line.lineTotal) : toNumber(line.quantity) * toNumber(line.finalUnitPrice ?? line.unitPrice),
        rate: toNumber(line.vatRate),
      })),
      vatCredit: doc.vatCredit as VatCredit | null,
      vatPeriod: doc.vatPeriod,
    };
  }

  /**
   * Invoices of the last 12 periods posted after their own period was generated: they are in no filing
   * unless moved into a later period, where the credit can still be claimed.
   */
  private async lateDocuments(companyId: string, period: string): Promise<ComplianceIssue[]> {
    const first = shiftVatPeriod(period, -12);
    const last = shiftVatPeriod(period, -1);
    const filed = await this.prisma.complianceFiling.groupBy({
      by: ['period'],
      where: { companyId, kind: KIND, period: { gte: first, lte: last } },
      _max: { createdAt: true },
    });
    if (filed.length === 0) return [];
    const filedAt = new Map(filed.map((row) => [row.period, row._max.createdAt!]));
    const docs = await this.prisma.document.findMany({
      where: {
        companyId,
        status: 'POSTED',
        type: { in: ['INVOICE', 'CREDIT_NOTE'] },
        vatPeriod: null,
        issuedOn: { gte: dateValue(vatPeriodRange(first).from), lte: dateValue(vatPeriodRange(last).to) },
      },
      select: PURCHASE_SELECT,
    });
    return docs.flatMap((doc) => {
      const natural = vatPeriodOf(isoDate(doc.issuedOn));
      const at = filedAt.get(natural);
      if (!at || !doc.postedAt || doc.postedAt <= at) return [];
      const { row } = purchaseRow(this.purchaseInput(doc), natural);
      if (row.credit === 'EXCLUDED') return [];
      return [
        {
          severity: 'warning' as const,
          code: 'LATE_DOCUMENT',
          params: { document: documentLabel(row.number, row.partnerName), date: row.date, period: natural },
          ref: { kind: 'document' as const, id: doc.id, documentType: doc.type },
        },
      ];
    });
  }

  // ─── Document treatment ───────────────────────────────────────────────────

  async setTreatment(user: AuthUser, documentId: string, dto: VatDocumentTreatmentDto) {
    const doc = await this.prisma.document.findFirst({
      where: { id: documentId, companyId: user.companyId },
      select: { id: true, type: true, issuedOn: true, vatCredit: true, vatPeriod: true },
    });
    if (!doc) throw new NotFoundException('Document not found');
    if (doc.type !== 'INVOICE' && doc.type !== 'CREDIT_NOTE') throw new BadRequestException('Only invoices and credit or debit notes go in the purchase ledger.');
    const natural = vatPeriodOf(isoDate(doc.issuedOn));
    const data: Prisma.DocumentUpdateInput = {};
    if (dto.vatCredit !== undefined) data.vatCredit = dto.vatCredit;
    if (dto.vatPeriod !== undefined) {
      if (dto.vatPeriod !== null && dto.vatPeriod < natural) throw new BadRequestException('A document cannot be declared before the month it is dated.');
      if (dto.vatPeriod !== null && dto.vatPeriod > shiftVatPeriod(natural, 12)) {
        throw new BadRequestException('The VAT credit can be claimed only within 12 months of the document date.');
      }
      data.vatPeriod = dto.vatPeriod === natural ? null : dto.vatPeriod;
    }
    await this.prisma.document.update({ where: { id: doc.id }, data });
    await this.log(user, 'Document', doc.id, 'VAT_TREATMENT', {
      from: { vatCredit: doc.vatCredit, vatPeriod: doc.vatPeriod },
      to: { vatCredit: data.vatCredit ?? doc.vatCredit, vatPeriod: data.vatPeriod === undefined ? doc.vatPeriod : data.vatPeriod },
    });
    return { ok: true };
  }

  // ─── Manual entries ───────────────────────────────────────────────────────

  async createEntry(user: AuthUser, dto: VatEntryDto) {
    const row = await this.prisma.vatLedgerEntry.create({ data: { companyId: user.companyId, createdById: user.id, ...this.entryData(dto) } });
    await this.log(user, 'VatLedgerEntry', row.id, 'CREATE', { ledger: dto.ledger, period: dto.period, number: dto.number });
    return this.entryRecord(row);
  }

  async updateEntry(user: AuthUser, id: string, dto: VatEntryDto) {
    await this.findEntry(user.companyId, id);
    const row = await this.prisma.vatLedgerEntry.update({ where: { id }, data: this.entryData(dto) });
    await this.log(user, 'VatLedgerEntry', id, 'UPDATE', { ledger: dto.ledger, period: dto.period, number: dto.number });
    return this.entryRecord(row);
  }

  async deleteEntry(user: AuthUser, id: string) {
    const row = await this.findEntry(user.companyId, id);
    await this.prisma.vatLedgerEntry.delete({ where: { id } });
    await this.log(user, 'VatLedgerEntry', id, 'DELETE', { ledger: row.ledger, period: row.period, number: row.number });
    return { ok: true };
  }

  private async findEntry(companyId: string, id: string) {
    const row = await this.prisma.vatLedgerEntry.findFirst({ where: { id, companyId } });
    if (!row) throw new NotFoundException('Entry not found');
    return row;
  }

  private entryData(dto: VatEntryDto) {
    const keys: readonly string[] = dto.ledger === 'PURCHASES' ? VAT_PURCHASE_FIELDS : VAT_SALES_FIELDS;
    const amounts: Record<string, number> = {};
    for (const [key, value] of Object.entries(dto.amounts ?? {})) {
      if (!keys.includes(key)) throw new BadRequestException(`Field ${key} is not in the ${dto.ledger === 'PURCHASES' ? 'purchase' : 'sales'} ledger.`);
      if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > MAX_AMOUNT || round2(value) !== value) {
        throw new BadRequestException(`Field ${key} must be an amount with at most 2 decimals.`);
      }
      if (value !== 0) amounts[key] = value;
    }
    return {
      ledger: dto.ledger,
      period: dto.period,
      documentType: dto.documentType,
      number: dto.number,
      issuedOn: dateValue(dto.issuedOn),
      partnerTaxId: dto.partnerTaxId ? normaliseTaxId(dto.partnerTaxId) : null,
      partnerName: dto.partnerName,
      description: dto.description,
      amounts,
    };
  }

  private entryRecord(row: Prisma.VatLedgerEntryGetPayload<object>): VatEntryRecord {
    return {
      id: row.id,
      ledger: row.ledger as VatLedger,
      period: row.period,
      documentType: row.documentType,
      number: row.number,
      issuedOn: isoDate(row.issuedOn),
      partnerTaxId: row.partnerTaxId,
      partnerName: row.partnerName,
      description: row.description,
      amounts: row.amounts as Record<string, number>,
    };
  }

  // ─── Filings ──────────────────────────────────────────────────────────────

  async generate(user: AuthUser, period: string) {
    const { view, header } = await this.compute(user.companyId, this.checkPeriod(period));
    if (hasBlockingIssues(view.issues)) {
      throw new BadRequestException({ message: 'Fix the errors before generating the files.', issues: view.issues.filter((issue) => issue.severity === 'error') });
    }
    const latest = view.filings[0];
    if (latest && latest.sourceHash === view.sourceHash) {
      throw new BadRequestException(`Nothing changed since version ${latest.version}; download that one.`);
    }
    const files = nraFiles(header, view.purchases, view.sales, view.cells);
    return this.filings.create(user, {
      kind: KIND,
      period,
      sourceHash: view.sourceHash,
      summary: {
        '01': view.cells['01'],
        '20': view.cells['20'],
        '40': view.cells['40'],
        '50': view.cells['50'],
        '60': view.cells['60'],
        purchases: view.purchases.length,
        sales: view.sales.length,
      },
      issues: view.issues,
      files: files.map((file) => ({ ...file, contentType: 'text/plain; charset=windows-1251' })),
    });
  }

  async download(user: AuthUser, id: string) {
    const { filing, body } = await this.filings.zip(user.companyId, id);
    return { body, fileName: `VAT_${filing.period.replace('-', '')}_v${filing.version}.zip` };
  }

  async markSubmitted(user: AuthUser, id: string, dto: VatSubmittedDto) {
    const submittedAt = dto.submittedAt ?? businessDate();
    if (submittedAt > businessDate()) throw new BadRequestException('The submission date cannot be in the future.');
    return this.filings.markSubmitted(user, id, dto.submissionRef, dateValue(submittedAt));
  }

  // ─── Excel ────────────────────────────────────────────────────────────────

  async export(user: AuthUser, period: string, query: VatExportQueryDto) {
    const lang = query.lang ?? 'en';
    const { view } = await this.compute(user.companyId, this.checkPeriod(period));
    const t = (key: string) => TEXT[key][lang];
    const generated = new Intl.DateTimeFormat(lang === 'bg' ? 'bg-BG' : 'en-GB', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: BUSINESS_TIME_ZONE,
    }).format(new Date());
    const name = view.settings.legalName || view.settings.companyName;
    const latest = view.filings[0];
    const status = latest && !view.changedSinceFiling ? `v${latest.version}` : t('notFiled');
    const heading = (title: string) => [
      title,
      `${name} — ${t('vatNumber')}: ${view.settings.vatNumber ?? '—'}`,
      `${t('period')}: ${period}`,
      `${t('generated')}: ${generated} · ${status}`,
    ];
    const common = { dateFormat: lang === 'bg' ? 'dd.mm.yyyy' : 'yyyy-mm-dd', notes: [] as string[] };
    let body: Buffer;

    if (query.ledger === 'return') {
      const rows: ReportCell[][] = VAT_RETURN_SECTIONS.flatMap((section) => section.cells.map((cell) => [cell, VAT_RETURN_CELL_LABELS[cell][lang], view.cells[cell] ?? 0]));
      body = await buildXlsx({
        ...common,
        sheetName: t('return'),
        heading: heading(t('return')),
        columns: [
          { header: t('cell'), type: 'text' },
          { header: t('cellDescription'), type: 'text' },
          { header: t('amount'), type: 'money' },
        ],
        rows,
        totals: null,
      });
    } else {
      const purchases = query.ledger === 'purchases';
      const rows = purchases ? view.purchases : view.sales;
      const fields = this.exportFields(purchases, rows);
      const labels = purchases ? VAT_PURCHASE_FIELD_LABELS : VAT_SALES_FIELD_LABELS;
      const columns: XlsxColumn[] = [
        { header: t('seq'), type: 'int' },
        { header: t('type'), type: 'text' },
        { header: t('number'), type: 'text' },
        { header: t('date'), type: 'date' },
        { header: t('partnerTaxId'), type: 'text' },
        { header: t('partnerName'), type: 'text' },
        { header: t('description'), type: 'text' },
        ...fields.map((field) => ({ header: `${(labels as Record<string, { column: number } & Record<ReportLang, string>>)[field][lang]} (${field})`, type: 'money' as const })),
      ];
      const totals: ReportCell[] = [t('total'), null, null, null, null, null, null, ...fields.map((field) => round2(rows.reduce((sum, row) => sum + (row.amounts[field] ?? 0), 0)))];
      body = await buildXlsx({
        ...common,
        sheetName: t(query.ledger),
        heading: heading(t(query.ledger)),
        columns,
        rows: rows.map((row, index) => [
          index + 1,
          `${row.documentType} ${VAT_DOCUMENT_TYPES[row.documentType]?.[lang] ?? ''}`.trim(),
          row.number,
          row.date,
          row.partnerTaxId,
          row.partnerName,
          row.description,
          ...fields.map((field) => row.amounts[field] ?? 0),
        ]),
        totals,
      });
    }
    return {
      body,
      fileName: `VAT_${query.ledger}_${period.replace('-', '')}.xlsx`,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };
  }

  /** The usual columns plus any other field that has an amount this period. */
  private exportFields(purchases: boolean, rows: VatLedgerRow[]) {
    const all: readonly string[] = purchases ? VAT_PURCHASE_FIELDS : ['10', '20', ...VAT_SALES_FIELDS];
    const always = purchases ? ['30', '31', '41', '32', '42'] : ['10', '20', '11', '21', '13', '24', '19'];
    return all.filter((field) => always.includes(field) || rows.some((row) => (row.amounts[field] ?? 0) !== 0));
  }

  private log(user: AuthUser, entityType: string, entityId: string, action: string, metadata: Record<string, unknown>) {
    return this.prisma.activityLog.create({
      data: { companyId: user.companyId, userId: user.id, entityType, entityId, action, metadata: metadata as Prisma.InputJsonValue },
    });
  }
}
