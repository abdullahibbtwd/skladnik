/**
 * Unit checks for first-scan milestone idempotency (mocked Prisma).
 */
import assert from 'node:assert/strict';
import { recordFirstSuccessfulScan } from './record-first-scan';

function mockDb(opts: { updateCount: number }) {
  const activityCreates: unknown[] = [];
  let updateCalls = 0;
  const db = {
    company: {
      updateMany: async () => {
        updateCalls += 1;
        return { count: opts.updateCount };
      },
    },
    activityLog: {
      create: async (args: unknown) => {
        activityCreates.push(args);
        return args;
      },
    },
  };
  return { db, activityCreates, getUpdateCalls: () => updateCalls };
}

export default (async () => {
  {
    const { db, activityCreates, getUpdateCalls } = mockDb({ updateCount: 1 });
    const recorded = await recordFirstSuccessfulScan(db as never, {
      companyId: 'co-1',
      documentId: 'doc-1',
      captureId: 'cap-1',
      now: new Date('2026-11-18T12:00:00.000Z'),
    });
    assert.equal(recorded, true);
    assert.equal(getUpdateCalls(), 1);
    assert.equal(activityCreates.length, 1);
  }

  {
    const { db, activityCreates, getUpdateCalls } = mockDb({ updateCount: 0 });
    const recorded = await recordFirstSuccessfulScan(db as never, {
      companyId: 'co-1',
      documentId: 'doc-2',
      captureId: 'cap-2',
    });
    assert.equal(recorded, false);
    assert.equal(getUpdateCalls(), 1);
    assert.equal(activityCreates.length, 0);
  }

  console.log('record-first-scan.test.ts: ok');
})();
