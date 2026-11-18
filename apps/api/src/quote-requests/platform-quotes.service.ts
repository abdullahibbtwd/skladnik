import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  canTransitionQuoteStatus,
  type QuoteRequestStatus,
} from '@skladnik/shared';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { ListPlatformQuotesQueryDto } from './dto/list-platform-quotes.dto';

@Injectable()
export class PlatformQuotesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListPlatformQuotesQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where = this.buildWhere(query);

    const [total, rows] = await Promise.all([
      this.prisma.quoteRequest.count({ where }),
      this.prisma.quoteRequest.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      quotes: rows.map((row) => this.serialize(row)),
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  async listRecentNew(limit = 5) {
    const rows = await this.prisma.quoteRequest.findMany({
      where: { status: 'NEW' },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return { quotes: rows.map((row) => this.serialize(row)) };
  }

  async get(id: string) {
    const row = await this.prisma.quoteRequest.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Quote request not found');
    return { quote: this.serialize(row) };
  }

  async updateStatus(id: string, toStatus: QuoteRequestStatus) {
    const row = await this.prisma.quoteRequest.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Quote request not found');

    const from = row.status as QuoteRequestStatus;
    if (from === toStatus) {
      return { quote: this.serialize(row) };
    }
    if (!canTransitionQuoteStatus(from, toStatus)) {
      throw new BadRequestException(`Cannot transition quote from ${from} to ${toStatus}`);
    }

    const updated = await this.prisma.quoteRequest.update({
      where: { id },
      data: { status: toStatus, statusUpdatedAt: new Date() },
    });
    return { quote: this.serialize(updated) };
  }

  async countNew() {
    return this.prisma.quoteRequest.count({ where: { status: 'NEW' } });
  }

  private buildWhere(query: ListPlatformQuotesQueryDto): Prisma.QuoteRequestWhereInput {
    const where: Prisma.QuoteRequestWhereInput = {};
    if (query.status) where.status = query.status;
    const q = query.q?.trim();
    if (q) {
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { contact: { contains: q, mode: 'insensitive' } },
        { businessType: { contains: q, mode: 'insensitive' } },
      ];
    }
    return where;
  }

  private serialize(row: {
    id: string;
    name: string;
    businessType: string;
    locations: number;
    contact: string;
    message: string | null;
    locale: string;
    utmSource: string | null;
    utmMedium: string | null;
    utmCampaign: string | null;
    referrer: string | null;
    status: string;
    statusUpdatedAt: Date | null;
    createdAt: Date;
  }) {
    return {
      id: row.id,
      name: row.name,
      businessType: row.businessType,
      locations: row.locations,
      contact: row.contact,
      message: row.message,
      locale: row.locale,
      utmSource: row.utmSource,
      utmMedium: row.utmMedium,
      utmCampaign: row.utmCampaign,
      referrer: row.referrer,
      status: row.status as QuoteRequestStatus,
      statusUpdatedAt: row.statusUpdatedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
