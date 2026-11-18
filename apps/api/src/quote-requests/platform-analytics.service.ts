import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type DayCount = { date: string; count: number };
type UtmRow = { source: string; count: number };

@Injectable()
export class PlatformAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(days: 30 | 90 = 30) {
    const since = startOfUtcDay(addUtcDays(new Date(), -(days - 1)));
    const dayKeys = enumerateUtcDays(since, days);

    const [quotes, companies, statusGroups, utmRows, firstScanCount, trialCompanies, activeCompanies] =
      await Promise.all([
        this.prisma.quoteRequest.findMany({
          where: { createdAt: { gte: since } },
          select: { createdAt: true, status: true },
        }),
        this.prisma.company.findMany({
          where: { createdAt: { gte: since } },
          select: { createdAt: true, firstScanAt: true, utmSource: true },
        }),
        this.prisma.quoteRequest.groupBy({
          by: ['status'],
          _count: { _all: true },
        }),
        this.prisma.$queryRaw<UtmRow[]>`
          SELECT COALESCE(NULLIF(TRIM("utmSource"), ''), '(none)') AS source, COUNT(*)::int AS count
          FROM "Company"
          WHERE "createdAt" >= ${since}
          GROUP BY 1
          ORDER BY count DESC
          LIMIT 8
        `,
        this.prisma.company.count({
          where: { createdAt: { gte: since }, firstScanAt: { not: null } },
        }),
        this.prisma.company.count({
          where: {
            createdAt: { gte: since },
            subscriptions: { some: { status: 'TRIAL' } },
          },
        }),
        this.prisma.company.count({
          where: {
            createdAt: { gte: since },
            subscriptions: { some: { status: 'ACTIVE' } },
          },
        }),
      ]);

    const quotesByDay = fillDayCounts(dayKeys, quotes.map((q) => q.createdAt));
    const signupsByDay = fillDayCounts(dayKeys, companies.map((c) => c.createdAt));

    const quotesByStatus = Object.fromEntries(
      statusGroups.map((row) => [row.status, row._count._all]),
    ) as Partial<Record<'NEW' | 'CONTACTED' | 'CLOSED', number>>;

    const topUtm = utmRows[0]?.source && utmRows[0].source !== '(none)' ? utmRows[0] : utmRows.find((r) => r.source !== '(none)') ?? utmRows[0] ?? null;

    return {
      days,
      since: since.toISOString(),
      metrics: {
        quotesInRange: quotes.length,
        companiesInRange: companies.length,
        firstScansInRange: firstScanCount,
        topUtmSource: topUtm?.source ?? null,
        topUtmCount: topUtm?.count ?? 0,
      },
      series: {
        quotesByDay,
        signupsByDay,
      },
      quotesByStatus: {
        NEW: quotesByStatus.NEW ?? 0,
        CONTACTED: quotesByStatus.CONTACTED ?? 0,
        CLOSED: quotesByStatus.CLOSED ?? 0,
      },
      utmSources: utmRows.map((row) => ({
        source: row.source,
        count: Number(row.count),
      })),
      funnel: {
        companiesCreated: companies.length,
        firstScan: firstScanCount,
        stillTrial: trialCompanies,
        activated: activeCompanies,
      },
    };
  }
}

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function addUtcDays(d: Date, delta: number): Date {
  const next = new Date(d);
  next.setUTCDate(next.getUTCDate() + delta);
  return next;
}

function enumerateUtcDays(since: Date, days: number): string[] {
  const keys: string[] = [];
  for (let i = 0; i < days; i++) {
    keys.push(utcDayKey(addUtcDays(since, i)));
  }
  return keys;
}

function utcDayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function fillDayCounts(dayKeys: string[], dates: Date[]): DayCount[] {
  const map = new Map(dayKeys.map((key) => [key, 0]));
  for (const date of dates) {
    const key = utcDayKey(date);
    if (map.has(key)) map.set(key, (map.get(key) ?? 0) + 1);
  }
  return dayKeys.map((date) => ({ date, count: map.get(date) ?? 0 }));
}
