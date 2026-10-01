import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  ANNEX38_KIND,
  hasBlockingIssues,
  isVatPeriod,
  type Annex38PaymentCode,
  type Annex38View,
  type AuthUser,
  type ComplianceIssue,
  type EShopSettings,
  type EShopType,
} from '@skladnik/shared';
import { recordActivity } from '../activity/record-activity';
import { ComplianceFilingsService } from '../compliance/filings.service';
import { stableHash } from '../compliance/hash';
import { PrismaService } from '../prisma/prisma.service';
import { businessDate } from '../sales/business-day';
import { annex38File, annex38FileName, buildAnnex38, type Annex38SaleInput } from './annex38-file';
import type { Annex38SubmittedDto, EShopSettingsDto } from './annex38.dto';

const dateValue = (value: string) => new Date(`${value}T00:00:00Z`);

type EShopRow = { number: string; webAddress: string; type: number; cashPayment: number; cardPayment: number; posTerminal: string | null; paymentProvider: string | null };

function settingsOf(row: EShopRow | null): EShopSettings | null {
  if (!row) return null;
  return {
    number: row.number,
    webAddress: row.webAddress,
    type: row.type as EShopType,
    cashPayment: row.cashPayment as Annex38PaymentCode,
    cardPayment: row.cardPayment as Annex38PaymentCode,
    posTerminal: row.posTerminal,
    paymentProvider: row.paymentProvider,
  };
}

/** Annex 38 audit files: one per e-shop (site) and month, archived with their SHA-256. Owner and accountant. */
@Injectable()
export class Annex38Service {
  constructor(
    private readonly prisma: PrismaService,
    private readonly filings: ComplianceFilingsService,
  ) {}

  // ─── E-shop registration ──────────────────────────────────────────────────

  async sites(user: AuthUser) {
    const sites = await this.prisma.site.findMany({
      where: { companyId: user.companyId },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
      select: { id: true, name: true, isActive: true, eShop: true },
    });
    return { sites: sites.map((site) => ({ id: site.id, name: site.name, isActive: site.isActive, settings: settingsOf(site.eShop) })) };
  }

  async saveSettings(user: AuthUser, siteId: string, dto: EShopSettingsDto) {
    const site = await this.site(user, siteId);
    const before = settingsOf(await this.prisma.eShop.findUnique({ where: { siteId } }));
    const data = {
      number: dto.number,
      webAddress: dto.webAddress,
      type: dto.type,
      cashPayment: dto.cashPayment,
      cardPayment: dto.cardPayment,
      posTerminal: dto.posTerminal ?? null,
      paymentProvider: dto.paymentProvider ?? null,
    };
    const row = await this.prisma.eShop.upsert({ where: { siteId }, create: { siteId, companyId: user.companyId, ...data }, update: data });
    const after = settingsOf(row)!;
    const changed = Object.keys(after).filter((key) => before?.[key as keyof EShopSettings] !== after[key as keyof EShopSettings]);
    if (changed.length > 0) {
      await recordActivity(this.prisma, user, {
        entityType: 'Site',
        entityId: siteId,
        label: site.name,
        action: before ? 'UPDATE' : 'CREATE',
        before: before ? Object.fromEntries(changed.map((key) => [`eShop.${key}`, before[key as keyof EShopSettings]])) : undefined,
        after: Object.fromEntries(changed.map((key) => [`eShop.${key}`, after[key as keyof EShopSettings]])),
        metadata: { eShop: true },
      });
    }
    return { siteId, settings: after };
  }

  // ─── Period view ──────────────────────────────────────────────────────────

  async view(user: AuthUser, siteId: string, period: string): Promise<Annex38View> {
    return (await this.compute(user, siteId, this.checkPeriod(period))).view;
  }

  private checkPeriod(period: string) {
    if (!isVatPeriod(period) || period < '2020-01') throw new BadRequestException('The period must be YYYY-MM, from 2020-01.');
    return period;
  }

  private async site(user: AuthUser, siteId: string) {
    const site = await this.prisma.site.findFirst({ where: { id: siteId, companyId: user.companyId }, select: { id: true, name: true } });
    if (!site) throw new NotFoundException('Site not found');
    return site;
  }

  private async compute(user: AuthUser, siteId: string, period: string) {
    const site = await this.site(user, siteId);
    const today = businessDate();
    const [company, eShop, filings] = await Promise.all([
      this.prisma.company.findUniqueOrThrow({ where: { id: user.companyId }, select: { name: true, eik: true } }),
      this.prisma.eShop.findUnique({ where: { siteId } }),
      this.filings.list(user.companyId, ANNEX38_KIND, period, siteId),
    ]);
    const settings = settingsOf(eShop);
    // ACC-05: no e-shop order model yet — never feed till receipts into Annex 38.
    const sales: Annex38SaleInput[] = [];

    const built = buildAnnex38({ period, today, company, settings, sales });
    const issues: ComplianceIssue[] = [...built.issues];
    if (settings) {
      issues.push({
        severity: 'error',
        code: 'ESHOP_ORDERS_UNAVAILABLE',
        ref: { kind: 'eshop' },
      });
    }
    const sourceHash = stableHash({ eik: company.eik, settings, orders: built.orders, returns: built.returns });
    const latest = filings[0] ?? null;
    const changedSinceFiling = latest !== null && latest.sourceHash !== sourceHash;
    if (changedSinceFiling) issues.push({ severity: 'warning', code: 'CHANGED_SINCE_FILING', params: { version: latest.version }, ref: { kind: 'period', period } });
    if (!latest && today > built.dueBy) issues.push({ severity: 'warning', code: 'LATE', params: { period, due: built.dueBy }, ref: { kind: 'period', period } });
    const order = { error: 0, warning: 1, info: 2 };
    issues.sort((a, b) => order[a.severity] - order[b.severity]);

    const view: Annex38View = {
      period,
      site,
      company,
      settings,
      orders: built.orders,
      returns: built.returns,
      totals: built.totals,
      dueBy: built.dueBy,
      issues,
      filings,
      sourceHash,
      changedSinceFiling,
    };
    return { view, company, settings, site };
  }

  // ─── Filings ──────────────────────────────────────────────────────────────

  async generate(user: AuthUser, siteId: string, period: string) {
    const { view, company, settings, site } = await this.compute(user, siteId, this.checkPeriod(period));
    if (hasBlockingIssues(view.issues) || !settings || !company.eik) {
      throw new BadRequestException({ message: 'Fix the errors before generating the file.', issues: view.issues.filter((issue) => issue.severity === 'error') });
    }
    const latest = view.filings[0];
    if (latest && latest.sourceHash === view.sourceHash) {
      throw new BadRequestException(`Nothing changed since version ${latest.version}; download that one.`);
    }
    const body = annex38File({ eik: company.eik, settings, period, creationDate: businessDate() }, view.orders, view.returns);
    return this.filings.create(user, {
      kind: ANNEX38_KIND,
      period,
      scope: siteId,
      label: `Annex 38 ${site.name} ${period}`,
      sourceHash: view.sourceHash,
      summary: {
        site: site.name,
        eShop: settings.number,
        orders: view.totals.orders,
        total: view.totals.total,
        vat: view.totals.vat,
        returns: view.totals.returns,
        returned: view.totals.returned,
      },
      issues: view.issues,
      files: [{ name: annex38FileName(settings, period), body, contentType: 'application/xml; charset=windows-1251' }],
    });
  }

  async archive(user: AuthUser) {
    return { filings: await this.filings.archive(user.companyId, ANNEX38_KIND) };
  }

  async download(user: AuthUser, id: string) {
    await this.filings.find(user.companyId, id, ANNEX38_KIND);
    const { files } = await this.filings.files(user.companyId, id);
    const [file] = files;
    return { body: file.data, fileName: file.name };
  }

  async markSubmitted(user: AuthUser, id: string, dto: Annex38SubmittedDto) {
    await this.filings.find(user.companyId, id, ANNEX38_KIND);
    const submittedAt = dto.submittedAt ?? businessDate();
    if (submittedAt > businessDate()) throw new BadRequestException('The submission date cannot be in the future.');
    return this.filings.markSubmitted(user, id, dto.submissionRef, dateValue(submittedAt));
  }
}
