import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { REPORT_COLUMN_CHOICES, type AuthUser, type ReportKind } from '@skladnik/shared';
import { PrismaService } from '../prisma/prisma.service';
import type { ExportProfileDto } from './dto/export-profile.dto';

const RATE_COLUMN = /^(net|vat)_\d+(\.\d+)?$/;
const select = {
  id: true,
  reportKind: true,
  name: true,
  columns: true,
  delimiter: true,
  decimalSeparator: true,
  dateFormat: true,
  encoding: true,
  includeHeader: true,
  updatedAt: true,
} as const;

/** Saved CSV layouts: which columns, in what order, under which titles, in which format (§4.8). */
@Injectable()
export class ExportProfilesService {
  constructor(private readonly prisma: PrismaService) {}

  list(user: AuthUser, reportKind?: ReportKind) {
    return this.prisma.exportProfile.findMany({
      where: { companyId: user.companyId, ...(reportKind ? { reportKind } : {}) },
      orderBy: [{ reportKind: 'asc' }, { name: 'asc' }],
      select,
    });
  }

  async create(user: AuthUser, dto: ExportProfileDto) {
    this.validate(dto);
    try {
      return await this.prisma.exportProfile.create({ data: { companyId: user.companyId, ...this.data(dto) }, select });
    } catch (error) {
      throw this.conflict(error);
    }
  }

  async update(user: AuthUser, id: string, dto: ExportProfileDto) {
    this.validate(dto);
    await this.find(user, id);
    try {
      return await this.prisma.exportProfile.update({ where: { id }, data: this.data(dto), select });
    } catch (error) {
      throw this.conflict(error);
    }
  }

  async remove(user: AuthUser, id: string) {
    await this.find(user, id);
    await this.prisma.exportProfile.delete({ where: { id } });
    return { ok: true };
  }

  private async find(user: AuthUser, id: string) {
    const profile = await this.prisma.exportProfile.findFirst({ where: { id, companyId: user.companyId }, select: { id: true } });
    if (!profile) throw new NotFoundException('Export layout not found');
    return profile;
  }

  private validate(dto: ExportProfileDto) {
    const allowed = new Set(REPORT_COLUMN_CHOICES[dto.reportKind]);
    const unknown = dto.columns.filter(
      (column) => !allowed.has(column.key) && !(dto.reportKind === 'vat-journal' && RATE_COLUMN.test(column.key)),
    );
    if (unknown.length) {
      throw new BadRequestException(`Unknown columns for this report: ${unknown.map((column) => column.key).join(', ')}`);
    }
    if (dto.decimalSeparator === dto.delimiter) {
      throw new BadRequestException('The decimal mark and the column separator must differ');
    }
  }

  private data(dto: ExportProfileDto) {
    return {
      reportKind: dto.reportKind,
      name: dto.name,
      columns: dto.columns.map((column) => ({ key: column.key, header: column.header })),
      delimiter: dto.delimiter,
      decimalSeparator: dto.decimalSeparator,
      dateFormat: dto.dateFormat,
      encoding: dto.encoding,
      includeHeader: dto.includeHeader,
    };
  }

  private conflict(error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return new ConflictException('A layout with this name already exists for this report');
    }
    return error;
  }
}
