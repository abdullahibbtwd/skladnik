/**
 * Marketing unsubscribe token + opt-out idempotency.
 */
import assert from 'node:assert/strict';
import {
  createMarketingUnsubscribeToken,
  verifyMarketingUnsubscribeToken,
} from './marketing-unsubscribe-token';
import { UnsubscribeService } from './unsubscribe.service';
import { isLifecycleEmailsEnabled } from './lifecycle-emails-enabled';

const secret = 'test-marketing-unsub-secret';

{
  const token = createMarketingUnsubscribeToken('user-abc', secret);
  const ok = verifyMarketingUnsubscribeToken(token, secret);
  assert.deepEqual(ok, { ok: true, userId: 'user-abc' });
}

{
  const token = createMarketingUnsubscribeToken('user-abc', secret);
  const bad = verifyMarketingUnsubscribeToken(token.slice(0, -2) + 'xx', secret);
  assert.equal(bad.ok, false);
  if (!bad.ok) assert.equal(bad.reason, 'tampered');
}

{
  assert.equal(verifyMarketingUnsubscribeToken('', secret).ok, false);
  assert.equal(verifyMarketingUnsubscribeToken('not-a-token', secret).ok, false);
  assert.equal(verifyMarketingUnsubscribeToken('a.b.c', secret).ok, false);
}

{
  assert.equal(isLifecycleEmailsEnabled({ get: () => undefined } as never), true);
  assert.equal(isLifecycleEmailsEnabled({ get: () => '' } as never), true);
  assert.equal(isLifecycleEmailsEnabled({ get: () => 'true' } as never), true);
  assert.equal(isLifecycleEmailsEnabled({ get: () => 'false' } as never), false);
  assert.equal(isLifecycleEmailsEnabled({ get: () => 'off' } as never), false);
}

export default (async () => {
  let optOutAt: Date | null = null;
  const prisma = {
    user: {
      findUnique: async () => ({
        id: 'user-1',
        locale: 'bg',
        marketingOptOutAt: optOutAt,
      }),
      updateMany: async (args: {
        where: { marketingOptOutAt: null };
        data: { marketingOptOutAt: Date };
      }) => {
        assert.equal(args.where.marketingOptOutAt, null);
        optOutAt = args.data.marketingOptOutAt;
        return { count: 1 };
      },
    },
  };
  const config = {
    get: (key: string) => {
      if (key === 'MARKETING_UNSUBSCRIBE_SECRET') return secret;
      if (key === 'WEB_ORIGIN') return 'https://oborotix.com';
      return undefined;
    },
  };
  const service = new UnsubscribeService(prisma as never, config as never);
  const token = service.createTokenForUser('user-1');

  const confirm = await service.pageForToken(token);
  assert.equal(confirm.status, 200);
  assert.ok(confirm.html.includes('Потвърдете'));

  const first = await service.optOut(token);
  assert.equal(first.status, 200);
  assert.ok(first.html.includes('Отписани сте'));
  assert.ok(optOutAt);

  const second = await service.optOut(token);
  assert.equal(second.status, 200);
  assert.ok(second.html.includes('Отписани сте'));

  const bad = await service.optOut('tampered.token');
  assert.equal(bad.status, 400);
  assert.ok(bad.html.includes('not valid') || bad.html.includes('не е валидна'));

  console.log('marketing-unsubscribe.test.ts: ok');
})();
