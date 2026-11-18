/**
 * Platform quote status transitions + list filtering (mocked Prisma).
 */
import assert from 'node:assert/strict';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { canTransitionQuoteStatus } from '@skladnik/shared';
import { PlatformQuotesService } from './platform-quotes.service';
import { PlatformAnalyticsService } from './platform-analytics.service';

assert.equal(canTransitionQuoteStatus('NEW', 'CONTACTED'), true);
assert.equal(canTransitionQuoteStatus('NEW', 'CLOSED'), true);
assert.equal(canTransitionQuoteStatus('CONTACTED', 'CLOSED'), true);
assert.equal(canTransitionQuoteStatus('CLOSED', 'NEW'), false);
assert.equal(canTransitionQuoteStatus('CLOSED', 'CONTACTED'), true);

function quoteRow(overrides: Partial<{
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
  status: 'NEW' | 'CONTACTED' | 'CLOSED';
  statusUpdatedAt: Date | null;
  createdAt: Date;
}> = {}) {
  return {
    id: 'q1',
    name: 'Ada',
    businessType: 'Grocery',
    locations: 2,
    contact: 'ada@shop.bg',
    message: 'Hello',
    locale: 'en',
    utmSource: 'google',
    utmMedium: 'cpc',
    utmCampaign: null,
    referrer: null,
    status: 'NEW' as const,
    statusUpdatedAt: null,
    createdAt: new Date('2026-11-01T12:00:00.000Z'),
    ...overrides,
  };
}

export default (async () => {
  {
    const row = quoteRow();
    let updatedStatus: string | null = null;
    const prisma = {
      quoteRequest: {
        findUnique: async () => row,
        update: async ({ data }: { data: { status: string; statusUpdatedAt: Date } }) => {
          updatedStatus = data.status;
          return quoteRow({ status: data.status as 'CONTACTED', statusUpdatedAt: data.statusUpdatedAt });
        },
      },
    };
    const service = new PlatformQuotesService(prisma as never);
    const result = await service.updateStatus('q1', 'CONTACTED');
    assert.equal(updatedStatus, 'CONTACTED');
    assert.equal(result.quote.status, 'CONTACTED');
    assert.ok(result.quote.statusUpdatedAt);
  }

  {
    const prisma = {
      quoteRequest: {
        findUnique: async () => quoteRow({ status: 'CLOSED' }),
        update: async () => {
          throw new Error('should not update');
        },
      },
    };
    const service = new PlatformQuotesService(prisma as never);
    await assert.rejects(() => service.updateStatus('q1', 'NEW'), BadRequestException);
  }

  {
    const prisma = {
      quoteRequest: {
        findUnique: async () => null,
      },
    };
    const service = new PlatformQuotesService(prisma as never);
    await assert.rejects(() => service.get('missing'), NotFoundException);
  }

  {
    const rows = [quoteRow({ id: 'a', name: 'Ada' }), quoteRow({ id: 'b', name: 'Bob', status: 'CONTACTED' })];
    const prisma = {
      quoteRequest: {
        count: async ({ where }: { where: { status?: string } }) =>
          rows.filter((r) => !where.status || r.status === where.status).length,
        findMany: async ({ where }: { where: { status?: string } }) =>
          rows.filter((r) => !where.status || r.status === where.status),
      },
    };
    const service = new PlatformQuotesService(prisma as never);
    const all = await service.list({ page: 1, pageSize: 20 });
    assert.equal(all.total, 2);
    const contacted = await service.list({ status: 'CONTACTED', page: 1, pageSize: 20 });
    assert.equal(contacted.total, 1);
    assert.equal(contacted.quotes[0]?.id, 'b');
  }

  {
    const since = new Date();
    since.setUTCDate(since.getUTCDate() - 5);
    const prisma = {
      quoteRequest: {
        findMany: async () => [
          { createdAt: new Date(), status: 'NEW' },
          { createdAt: new Date(), status: 'CLOSED' },
        ],
        groupBy: async () => [
          { status: 'NEW', _count: { _all: 3 } },
          { status: 'CONTACTED', _count: { _all: 1 } },
          { status: 'CLOSED', _count: { _all: 2 } },
        ],
      },
      company: {
        findMany: async () => [
          { createdAt: new Date(), firstScanAt: new Date(), utmSource: 'google' },
          { createdAt: new Date(), firstScanAt: null, utmSource: null },
        ],
        count: async ({ where }: { where: { firstScanAt?: unknown; subscriptions?: unknown } }) => {
          if (where.firstScanAt) return 1;
          if (where.subscriptions) return 1;
          return 0;
        },
      },
      $queryRaw: async () => [{ source: 'google', count: 4 }],
    };
    const analytics = new PlatformAnalyticsService(prisma as never);
    const summary = await analytics.summary(30);
    assert.equal(summary.days, 30);
    assert.equal(summary.metrics.quotesInRange, 2);
    assert.equal(summary.metrics.companiesInRange, 2);
    assert.equal(summary.metrics.firstScansInRange, 1);
    assert.equal(summary.metrics.topUtmSource, 'google');
    assert.equal(summary.quotesByStatus.NEW, 3);
    assert.equal(summary.series.quotesByDay.length, 30);
    assert.equal(summary.series.signupsByDay.length, 30);
    assert.equal(summary.funnel.companiesCreated, 2);
    assert.equal(summary.utmSources[0]?.source, 'google');
  }

  console.log('platform-quotes.test.ts: ok');
})();
