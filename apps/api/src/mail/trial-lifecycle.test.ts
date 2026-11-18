/**
 * Trial ending / ended eligibility (fake clock) + processor markers.
 */
import assert from 'node:assert/strict';
import {
  isEligibleForTrialEndedEmail,
  isEligibleForTrialEndingEmail,
  TRIAL_ENDING_DAYS_BEFORE,
} from '@skladnik/shared';
import { trialEndedCopyForLocale, trialEndingCopyForLocale } from './trial-lifecycle-copy';
import {
  TRIAL_ENDED_JOB,
  TRIAL_ENDING_JOB,
  trialEndedJobId,
  trialEndingJobId,
} from './trial-lifecycle.constants';
import { TrialLifecycleMailService } from './trial-lifecycle.service';
import { TrialLifecycleProcessor } from './trial-lifecycle.processor';

assert.equal(TRIAL_ENDING_DAYS_BEFORE, 3);
assert.ok(trialEndingCopyForLocale('en').subject.includes('3 days'));
assert.ok(trialEndedCopyForLocale('bg').ctaLabel.length > 0);
assert.equal(trialEndingJobId('co-1'), 'trial-ending-co-1');
assert.equal(trialEndedJobId('co-1'), 'trial-ended-co-1');

const now = new Date('2026-11-18T08:00:00.000Z');
const verified = new Date('2026-11-01T09:00:00.000Z');
// 3 calendar days ahead → 2026-11-21
const expiresIn3Days = new Date('2026-11-21T15:00:00.000Z');
// Expired yesterday → 2026-11-17
const expiredYesterday = new Date('2026-11-17T15:00:00.000Z');

assert.equal(
  isEligibleForTrialEndingEmail({
    now,
    trialEndingSentAt: null,
    subscriptionStatus: 'TRIAL',
    subscriptionExpiresAt: expiresIn3Days,
    ownerEmailVerifiedAt: verified,
  }),
  true,
);

assert.equal(
  isEligibleForTrialEndingEmail({
    now,
    trialEndingSentAt: null,
    subscriptionStatus: 'TRIAL',
    subscriptionExpiresAt: new Date('2026-11-20T15:00:00.000Z'),
    ownerEmailVerifiedAt: verified,
  }),
  false,
  'not the 3-days-before calendar day',
);

assert.equal(
  isEligibleForTrialEndingEmail({
    now,
    trialEndingSentAt: now,
    subscriptionStatus: 'TRIAL',
    subscriptionExpiresAt: expiresIn3Days,
    ownerEmailVerifiedAt: verified,
  }),
  false,
);

assert.equal(
  isEligibleForTrialEndingEmail({
    now,
    trialEndingSentAt: null,
    subscriptionStatus: 'ACTIVE',
    subscriptionExpiresAt: expiresIn3Days,
    ownerEmailVerifiedAt: verified,
  }),
  false,
);

assert.equal(
  isEligibleForTrialEndingEmail({
    now,
    trialEndingSentAt: null,
    subscriptionStatus: 'TRIAL',
    subscriptionExpiresAt: expiresIn3Days,
    ownerEmailVerifiedAt: null,
  }),
  false,
);

assert.equal(
  isEligibleForTrialEndedEmail({
    now,
    trialEndedSentAt: null,
    subscriptionStatus: 'TRIAL',
    subscriptionExpiresAt: expiredYesterday,
    ownerEmailVerifiedAt: verified,
  }),
  true,
);

assert.equal(
  isEligibleForTrialEndedEmail({
    now,
    trialEndedSentAt: null,
    subscriptionStatus: 'EXPIRED',
    subscriptionExpiresAt: expiredYesterday,
    ownerEmailVerifiedAt: verified,
  }),
  true,
);

assert.equal(
  isEligibleForTrialEndedEmail({
    now,
    trialEndedSentAt: null,
    subscriptionStatus: 'TRIAL',
    subscriptionExpiresAt: expiresIn3Days,
    ownerEmailVerifiedAt: verified,
  }),
  false,
  'still in trial window',
);

assert.equal(
  isEligibleForTrialEndedEmail({
    now,
    trialEndedSentAt: null,
    subscriptionStatus: 'TRIAL',
    subscriptionExpiresAt: new Date('2026-11-16T15:00:00.000Z'),
    ownerEmailVerifiedAt: verified,
  }),
  false,
  'expired two days ago — only day-after',
);

export default (async () => {
  {
    const calls: unknown[] = [];
    const queue = {
      add: async (name: string, data: unknown, opts: unknown) => {
        calls.push({ name, data, opts });
      },
    };
    const service = new TrialLifecycleMailService(queue as never);
    assert.equal(await service.enqueueEnding('co-1'), true);
    assert.equal(await service.enqueueEnded('co-1'), true);
    assert.equal((calls[0] as { name: string }).name, TRIAL_ENDING_JOB);
    assert.equal((calls[1] as { name: string }).name, TRIAL_ENDED_JOB);
  }

  {
    let markedEnding = false;
    const prisma = {
      company: {
        findUnique: async () => ({
          id: 'co-ending',
          trialEndingSentAt: null,
          trialEndedSentAt: null,
          subscriptions: [{ status: 'TRIAL', expiresAt: expiresIn3Days }],
          users: [
            {
              email: 'owner@example.com',
              name: 'Owner',
              locale: 'en',
              emailVerifiedAt: verified,
            },
          ],
        }),
        updateMany: async (args: {
          where: { trialEndingSentAt: null };
          data: { trialEndingSentAt: Date };
        }) => {
          markedEnding = Boolean(args.data.trialEndingSentAt);
          return { count: 1 };
        },
      },
    };
    const mail = {
      sendTrialEndingEmail: async () => ({ delivered: true }),
      sendTrialEndedEmail: async () => {
        throw new Error('wrong mail');
      },
    };
    const config = { get: () => 'https://oborotix.com' };
    const processor = new TrialLifecycleProcessor(prisma as never, mail as never, config as never);
    const result = await processor.runEnding('co-ending', now);
    assert.equal((result as { delivered: boolean }).delivered, true);
    assert.equal(markedEnding, true);
  }

  {
    let markedEnded = false;
    const prisma = {
      company: {
        findUnique: async () => ({
          id: 'co-ended',
          trialEndingSentAt: null,
          trialEndedSentAt: null,
          subscriptions: [{ status: 'TRIAL', expiresAt: expiredYesterday }],
          users: [
            {
              email: 'owner@example.com',
              name: 'Owner',
              locale: 'bg',
              emailVerifiedAt: verified,
            },
          ],
        }),
        updateMany: async (args: {
          where: { trialEndedSentAt: null };
          data: { trialEndedSentAt: Date };
        }) => {
          markedEnded = Boolean(args.data.trialEndedSentAt);
          return { count: 1 };
        },
      },
    };
    const mail = {
      sendTrialEndingEmail: async () => {
        throw new Error('wrong mail');
      },
      sendTrialEndedEmail: async (input: { locale: string; quoteUrl: string }) => {
        assert.equal(input.locale, 'bg');
        assert.ok(input.quoteUrl.endsWith('/#quote'));
        return { delivered: true };
      },
    };
    const config = { get: () => 'https://oborotix.com' };
    const processor = new TrialLifecycleProcessor(prisma as never, mail as never, config as never);
    const result = await processor.runEnded('co-ended', now);
    assert.equal((result as { delivered: boolean }).delivered, true);
    assert.equal(markedEnded, true);
  }

  console.log('trial-lifecycle.test.ts: ok');
})();
