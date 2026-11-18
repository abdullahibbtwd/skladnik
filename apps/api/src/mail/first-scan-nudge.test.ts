/**
 * First-scan nudge eligibility (fake clock) + enqueue idempotency.
 */
import assert from 'node:assert/strict';
import { isEligibleForFirstScanNudge } from '@skladnik/shared';
import { firstScanNudgeCopyForLocale } from './first-scan-nudge-copy';
import { firstScanNudgeJobId, FIRST_SCAN_NUDGE_JOB } from './first-scan-nudge.constants';
import { FirstScanNudgeMailService } from './first-scan-nudge.service';
import { FirstScanNudgeProcessor } from './first-scan-nudge.processor';

assert.equal(firstScanNudgeCopyForLocale('en').ctaLabel, 'Open Oborotix');
assert.ok(firstScanNudgeCopyForLocale('bg').ctaLabel.length > 0);
assert.equal(firstScanNudgeJobId('co-1'), 'first-scan-nudge-co-1');

const now = new Date('2026-11-18T08:00:00.000Z');
const createdOk = new Date('2026-11-16T08:00:00.000Z');
const verified = new Date('2026-11-16T09:00:00.000Z');
const trialExpires = new Date('2026-11-30T08:00:00.000Z');

const base = {
  now,
  companyCreatedAt: createdOk,
  firstScanAt: null,
  nudgeSentAt: null,
  subscriptionStatus: 'TRIAL',
  subscriptionExpiresAt: trialExpires,
  ownerEmailVerifiedAt: verified,
};

assert.equal(isEligibleForFirstScanNudge(base), true);

assert.equal(
  isEligibleForFirstScanNudge({
    ...base,
    companyCreatedAt: new Date('2026-11-18T00:00:00.000Z'),
  }),
  false,
  'company younger than 24h is skipped',
);

assert.equal(
  isEligibleForFirstScanNudge({ ...base, firstScanAt: now }),
  false,
  'already scanned',
);

assert.equal(
  isEligibleForFirstScanNudge({ ...base, nudgeSentAt: now }),
  false,
  'already nudged',
);

assert.equal(
  isEligibleForFirstScanNudge({ ...base, ownerEmailVerifiedAt: null }),
  false,
  'unverified owner skipped',
);

assert.equal(
  isEligibleForFirstScanNudge({
    ...base,
    subscriptionExpiresAt: new Date('2026-11-17T08:00:00.000Z'),
  }),
  false,
  'expired trial skipped',
);

assert.equal(
  isEligibleForFirstScanNudge({ ...base, subscriptionStatus: 'ACTIVE' }),
  false,
  'paid ACTIVE is not a trial nudge target',
);

assert.equal(
  isEligibleForFirstScanNudge({ ...base, ownerMarketingOptOutAt: now }),
  false,
  'marketing opt-out skips nudge',
);

export default (async () => {
  {
    const calls: unknown[] = [];
    const queue = {
      add: async (name: string, data: unknown, opts: unknown) => {
        calls.push({ name, data, opts });
      },
    };
    const service = new FirstScanNudgeMailService(queue as never);
    assert.equal(await service.enqueue('co-1'), true);
    assert.equal((calls[0] as { name: string }).name, FIRST_SCAN_NUDGE_JOB);
    assert.equal((calls[0] as { opts: { jobId: string } }).opts.jobId, 'first-scan-nudge-co-1');
  }

  {
    const queue = {
      add: async () => {
        throw new Error('Job first-scan-nudge-co-2 already exists');
      },
    };
    const service = new FirstScanNudgeMailService(queue as never);
    assert.equal(await service.enqueue('co-2'), false);
  }

  {
    let marked = false;
    const prisma = {
      company: {
        findUnique: async () => ({
          id: 'co-ok',
          name: 'Cafe',
          createdAt: createdOk,
          firstScanAt: null,
          nudgeSentAt: null,
          subscriptions: [{ status: 'TRIAL', expiresAt: trialExpires }],
          users: [
            {
              id: 'user-1',
              email: 'owner@example.com',
              name: 'Owner',
              locale: 'en',
              emailVerifiedAt: verified,
              marketingOptOutAt: null,
            },
          ],
        }),
        updateMany: async (args: { where: { nudgeSentAt: null }; data: { nudgeSentAt: Date } }) => {
          assert.equal(args.where.nudgeSentAt, null);
          marked = Boolean(args.data.nudgeSentAt);
          return { count: 1 };
        },
      },
    };
    const mail = {
      sendFirstScanNudgeEmail: async (input: {
        to: string;
        locale: string;
        unsubscribeUrl: string;
      }) => {
        assert.equal(input.to, 'owner@example.com');
        assert.equal(input.locale, 'en');
        assert.ok(input.unsubscribeUrl.includes('/public/unsubscribe'));
        return { delivered: true };
      },
    };
    const config = { get: () => 'https://oborotix.com' };
    const unsub = {
      unsubscribeUrl: (userId: string) =>
        `https://oborotix.com/public/unsubscribe?token=tok-${userId}`,
    };
    const processor = new FirstScanNudgeProcessor(
      prisma as never,
      mail as never,
      config as never,
      unsub as never,
    );
    const result = await processor.run('co-ok', now);
    assert.equal((result as { delivered: boolean }).delivered, true);
    assert.equal(marked, true);
  }

  {
    let marked = false;
    const prisma = {
      company: {
        findUnique: async () => ({
          id: 'co-skip',
          name: 'Cafe',
          createdAt: createdOk,
          firstScanAt: null,
          nudgeSentAt: null,
          subscriptions: [{ status: 'TRIAL', expiresAt: trialExpires }],
          users: [
            {
              id: 'user-2',
              email: 'owner@example.com',
              name: 'Owner',
              locale: 'en',
              emailVerifiedAt: null,
              marketingOptOutAt: null,
            },
          ],
        }),
        updateMany: async () => {
          marked = true;
          return { count: 1 };
        },
      },
    };
    const mail = {
      sendFirstScanNudgeEmail: async () => {
        throw new Error('should not send');
      },
    };
    const config = { get: () => 'https://oborotix.com' };
    const unsub = { unsubscribeUrl: () => 'https://oborotix.com/public/unsubscribe?token=x' };
    const processor = new FirstScanNudgeProcessor(
      prisma as never,
      mail as never,
      config as never,
      unsub as never,
    );
    const result = await processor.run('co-skip', now);
    assert.deepEqual(result, { skipped: true, reason: 'not_eligible' });
    assert.equal(marked, false);
  }

  console.log('first-scan-nudge.test.ts: ok');
})();
