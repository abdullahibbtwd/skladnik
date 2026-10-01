import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  DEFAULT_EXPIRY_WINDOWS,
  DEFAULT_SERIES_PADDING,
  DEFAULT_SERIES_PREFIX,
  DOCUMENT_SERIES,
  expiryWindowsProblem,
  normaliseEik,
  normaliseVatNumber,
  printTemplateOf,
  taxIdProblemMessage,
  taxIdProblems,
  type AuthUser,
  type CompanySettingsRecord,
  type DocumentSeriesKey,
  type UserRole,
} from '@skladnik/shared';
import { changes, recordActivity } from '../activity/record-activity';
import { PrismaService } from '../prisma/prisma.service';
import type { CompanyProfileDto, DocumentSeriesDto, PrintTemplateDto } from './company.dto';
import { seriesRecords } from './document-series';

const PROFILE_FIELDS = ['name', 'eik', 'vatNumber', 'address', 'city', 'mol', 'declarant', 'phone', 'email'] as const;

type CompanyRow = Prisma.CompanyGetPayload<object>;

@Injectable()
export class CompanyService {
  constructor(private readonly prisma: PrismaService) {}

  async settings(companyId: string): Promise<CompanySettingsRecord> {
    const [company, series] = await Promise.all([
      this.prisma.company.findUniqueOrThrow({ where: { id: companyId } }),
      seriesRecords(this.prisma, companyId),
    ]);
    return this.record(company, series);
  }

  async saveProfile(user: AuthUser, dto: CompanyProfileDto) {
    const existing = await this.prisma.company.findUniqueOrThrow({ where: { id: user.companyId } });
    const data = {
      name: dto.name.trim(),
      eik: dto.eik ? normaliseEik(dto.eik) : null,
      vatNumber: dto.vatNumber ? normaliseVatNumber(dto.vatNumber) : null,
      address: dto.address?.trim() || null,
      city: dto.city?.trim() || null,
      mol: dto.mol?.trim() || null,
      declarant: dto.declarant?.trim() || null,
      phone: dto.phone?.trim() || null,
      email: dto.email?.trim() || null,
    };
    const problems = taxIdProblems(data);
    if (problems.length) throw new BadRequestException(problems.map((problem) => taxIdProblemMessage(problem)).join('. '));
    await this.prisma.$transaction([
      this.prisma.company.update({ where: { id: user.companyId }, data }),
      // Keep VatSettings.declarant in sync so existing VAT generation keeps working.
      this.prisma.vatSettings.upsert({
        where: { companyId: user.companyId },
        create: { companyId: user.companyId, declarant: data.declarant },
        update: { declarant: data.declarant },
      }),
    ]);
    await this.log(user, 'UPDATE_PROFILE', existing, data, PROFILE_FIELDS);
    return this.settings(user.companyId);
  }

  async saveExpiryWindows(user: AuthUser, windows: number[]) {
    const problem = expiryWindowsProblem(windows);
    if (problem) throw new BadRequestException(problem);
    const existing = await this.prisma.company.findUniqueOrThrow({ where: { id: user.companyId } });
    await this.prisma.company.update({ where: { id: user.companyId }, data: { expiryWindows: windows } });
    await this.log(user, 'UPDATE_EXPIRY_WINDOWS', existing, { expiryWindows: windows }, ['expiryWindows']);
    return this.settings(user.companyId);
  }

  async savePrintTemplate(user: AuthUser, dto: PrintTemplateDto) {
    const template = printTemplateOf({
      ...dto,
      signatures: dto.signatures.map((label) => label.trim()).filter(Boolean),
      footer: dto.footer.trim(),
    });
    const existing = await this.prisma.company.findUniqueOrThrow({ where: { id: user.companyId } });
    await this.prisma.company.update({ where: { id: user.companyId }, data: { printTemplate: template } });
    await this.log(
      user,
      'UPDATE_PRINT_TEMPLATE',
      { printTemplate: printTemplateOf(existing.printTemplate) },
      { printTemplate: template },
      ['printTemplate'],
    );
    return this.settings(user.companyId);
  }

  async savePriceOverrideRoles(user: AuthUser, roles: UserRole[]) {
    const unique = [...new Set<UserRole>(['OWNER', ...roles])];
    const existing = await this.prisma.company.findUniqueOrThrow({ where: { id: user.companyId } });
    await this.prisma.company.update({ where: { id: user.companyId }, data: { priceOverrideRoles: unique } });
    await this.log(user, 'UPDATE_PRICE_OVERRIDE_ROLES', existing, { priceOverrideRoles: unique }, ['priceOverrideRoles']);
    return this.settings(user.companyId);
  }

  async saveSeries(user: AuthUser, key: string, dto: DocumentSeriesDto) {
    if (!(DOCUMENT_SERIES as readonly string[]).includes(key)) throw new NotFoundException('Unknown numbering series');
    const seriesKey = key as DocumentSeriesKey;
    const prefix = dto.prefix.trim();
    const where = { companyId_key: { companyId: user.companyId, key: seriesKey } };
    const existing = await this.prisma.documentSeries.findUnique({ where });
    const before = {
      prefix: existing?.prefix ?? DEFAULT_SERIES_PREFIX[seriesKey],
      padding: existing?.padding ?? DEFAULT_SERIES_PADDING,
      nextNumber: existing?.nextNumber ?? 1,
      resetYearly: existing?.resetYearly ?? false,
    };
    const data = {
      prefix,
      padding: dto.padding,
      nextNumber: dto.nextNumber,
      resetYearly: dto.resetYearly ?? existing?.resetYearly ?? false,
    };
    await this.prisma.documentSeries.upsert({ where, create: { companyId: user.companyId, key: seriesKey, ...data }, update: data });
    const diff = changes(before, data);
    if (diff) {
      await recordActivity(this.prisma, user, {
        entityType: 'DocumentSeries',
        entityId: seriesKey,
        action: 'UPDATE',
        label: seriesKey,
        ...diff,
      });
    }
    return this.settings(user.companyId);
  }

  private record(company: CompanyRow, series: CompanySettingsRecord['series']): CompanySettingsRecord {
    return {
      profile: {
        name: company.name,
        eik: company.eik,
        vatNumber: company.vatNumber,
        address: company.address,
        city: company.city,
        mol: company.mol,
        declarant: company.declarant,
        phone: company.phone,
        email: company.email,
      },
      expiryWindows: company.expiryWindows.length === 4 ? company.expiryWindows : [...DEFAULT_EXPIRY_WINDOWS],
      printTemplate: printTemplateOf(company.printTemplate),
      priceOverrideRoles: company.priceOverrideRoles,
      series,
    };
  }

  private async log(
    user: AuthUser,
    action: string,
    before: Record<string, unknown>,
    after: Record<string, unknown>,
    fields: readonly string[],
  ) {
    const diff = changes(before, after, fields);
    if (!diff) return;
    await recordActivity(this.prisma, user, {
      entityType: 'Company',
      entityId: user.companyId,
      action,
      label: typeof after.name === 'string' ? after.name : null,
      ...diff,
    });
  }
}
