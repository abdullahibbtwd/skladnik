/**
 * Welcome mail enqueue + processor behaviour (mocked queue / Prisma / SMTP).
 */
import assert from 'node:assert/strict';
import { BadGatewayException } from '@nestjs/common';
import { welcomeJobId, WELCOME_JOB_SEND } from './welcome.constants';
import { welcomeCopyForLocale } from './welcome-copy';
import { WelcomeMailService } from './welcome.service';
import { WelcomeMailProcessor } from './welcome.processor';

assert.equal(welcomeCopyForLocale('en').ctaLabel, 'Scan your first invoice');
assert.ok(welcomeCopyForLocale('bg').ctaLabel.length > 0);
assert.equal(welcomeJobId('user-1'), 'welcome-user-1');

export default (async () => {
  // Enqueue once with stable job id; queue errors must not throw to callers.
  {
    const calls: unknown[] = [];
    const queue = {
      add: async (name: string, data: unknown, opts: unknown) => {
        calls.push({ name, data, opts });
        return { id: '1' };
      },
    };
    const service = new WelcomeMailService(queue as never);
    await service.enqueueWelcome('user-1');
    await service.enqueueWelcome('user-1');
    assert.equal(calls.length, 2);
    assert.equal((calls[0] as { name: string }).name, WELCOME_JOB_SEND);
    assert.deepEqual((calls[0] as { data: unknown }).data, { userId: 'user-1' });
    assert.equal((calls[0] as { opts: { jobId: string } }).opts.jobId, 'welcome-user-1');
  }

  {
    const queue = {
      add: async () => {
        throw new Error('Redis down');
      },
    };
    const service = new WelcomeMailService(queue as never);
    await service.enqueueWelcome('user-2'); // must not throw
  }

  {
    const queue = {
      add: async () => {
        throw new Error('Job welcome-user-3 already exists');
      },
    };
    const service = new WelcomeMailService(queue as never);
    await service.enqueueWelcome('user-3'); // duplicate is fine
  }

  // Processor: skip when already sent; do not call mail again.
  {
    let mailCalls = 0;
    const prisma = {
      user: {
        findUnique: async () => ({
          id: 'u1',
          email: 'a@b.com',
          name: 'Ada',
          role: 'OWNER',
          isActive: true,
          locale: 'en',
          welcomeSentAt: new Date('2026-01-01T00:00:00.000Z'),
          company: { id: 'c1', name: 'Shop', subscriptions: [] },
        }),
        updateMany: async () => ({ count: 0 }),
      },
    };
    const mail = {
      sendWelcomeEmail: async () => {
        mailCalls += 1;
        return { delivered: true };
      },
    };
    const config = { get: () => 'http://localhost:5176' };
    const processor = new WelcomeMailProcessor(prisma as never, mail as never, config as never);
    const result = await processor.process({ data: { userId: 'u1' } } as never);
    assert.deepEqual(result, { skipped: true, reason: 'already_sent' });
    assert.equal(mailCalls, 0);
  }

  // Processor: invited / non-owner is marked without sending.
  {
    let mailCalls = 0;
    let marked = false;
    const prisma = {
      user: {
        findUnique: async () => ({
          id: 'u2',
          email: 'staff@b.com',
          name: 'Sam',
          role: 'STAFF',
          isActive: true,
          locale: 'en',
          welcomeSentAt: null,
          company: { id: 'c1', name: 'Shop', subscriptions: [] },
        }),
        updateMany: async (args: { data: { welcomeSentAt: Date | null } }) => {
          marked = Boolean(args.data.welcomeSentAt);
          return { count: 1 };
        },
      },
    };
    const mail = {
      sendWelcomeEmail: async () => {
        mailCalls += 1;
        return { delivered: true };
      },
    };
    const config = { get: () => 'http://localhost:5176' };
    const processor = new WelcomeMailProcessor(prisma as never, mail as never, config as never);
    const result = await processor.process({ data: { userId: 'u2' } } as never);
    assert.deepEqual(result, { skipped: true, reason: 'not_owner' });
    assert.equal(mailCalls, 0);
    assert.equal(marked, true);
  }

  // Processor: successful send marks welcomeSentAt.
  {
    let mailCalls = 0;
    let marked = false;
    const prisma = {
      user: {
        findUnique: async () => ({
          id: 'u3',
          email: 'owner@b.com',
          name: 'Olga',
          role: 'OWNER',
          isActive: true,
          locale: 'bg',
          welcomeSentAt: null,
          company: {
            id: 'c1',
            name: 'Shop',
            subscriptions: [{ expiresAt: new Date('2026-12-01T00:00:00.000Z'), status: 'TRIAL' }],
          },
        }),
        updateMany: async (args: { where: { welcomeSentAt: null }; data: { welcomeSentAt: Date } }) => {
          assert.equal(args.where.welcomeSentAt, null);
          marked = Boolean(args.data.welcomeSentAt);
          return { count: 1 };
        },
      },
    };
    const mail = {
      sendWelcomeEmail: async (input: { locale: string; to: string }) => {
        mailCalls += 1;
        assert.equal(input.locale, 'bg');
        assert.equal(input.to, 'owner@b.com');
        return { delivered: true };
      },
    };
    const config = { get: (key: string) => (key === 'WEB_ORIGIN' ? 'https://oborotix.com' : undefined) };
    const processor = new WelcomeMailProcessor(prisma as never, mail as never, config as never);
    await processor.process({ data: { userId: 'u3' } } as never);
    assert.equal(mailCalls, 1);
    assert.equal(marked, true);
  }

  // SMTP failure bubbles for BullMQ retry and does not mark welcomeSentAt.
  {
    let marked = false;
    const prisma = {
      user: {
        findUnique: async () => ({
          id: 'u4',
          email: 'owner@b.com',
          name: 'Olga',
          role: 'OWNER',
          isActive: true,
          locale: 'en',
          welcomeSentAt: null,
          company: { id: 'c1', name: 'Shop', subscriptions: [] },
        }),
        updateMany: async () => {
          marked = true;
          return { count: 1 };
        },
      },
    };
    const mail = {
      sendWelcomeEmail: async () => {
        throw new BadGatewayException('SMTP down');
      },
    };
    const config = { get: () => 'http://localhost:5176' };
    const processor = new WelcomeMailProcessor(prisma as never, mail as never, config as never);
    await assert.rejects(() => processor.process({ data: { userId: 'u4' } } as never), BadGatewayException);
    assert.equal(marked, false);
  }

  // Auth verify path: enqueue failures must not break callers (service contract).
  {
    const queue = {
      add: async () => {
        throw new Error('queue unavailable');
      },
    };
    const service = new WelcomeMailService(queue as never);
    await assert.doesNotReject(() => service.enqueueWelcome('verify-user'));
  }

  console.log('welcome-mail.test.ts: ok');
})();
