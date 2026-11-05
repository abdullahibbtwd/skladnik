import type { GuideTask } from './lib/task-types';
import { ensureStaffSubmitDraft, openFirstDraftDocument, writeOffDockButton } from './lib/task-helpers';
import { gotoApp, photographInvoiceButton, receiveDockButton, scanDockButton, sidebarLink } from './lib/nav';

/** Staff tasks from docs/TENANT_USER_GUIDE.md. */
export const STAFF_TASKS: GuideTask[] = [
  {
    id: 'staffScan',
    desktop: [
      {
        step: 1,
        prepare: async (page) => {
          await gotoApp(page, '/app');
        },
        target: (page) =>
          photographInvoiceButton(page)
            .or(page.getByRole('button', { name: /Photograph invoice/i }))
            .first(),
      },
      {
        step: 2,
        prepare: async (page) => {
          await openFirstDraftDocument(page);
        },
        target: (page) =>
          page
            .locator('main')
            .getByRole('heading')
            .first()
            .or(page.locator('main').getByText(/draft|lines|OCR/i).first())
            .first(),
      },
    ],
    mobile: [
      {
        step: 1,
        prepare: async (page) => {
          await gotoApp(page, '/app');
        },
        target: (page) => scanDockButton(page).first(),
      },
      {
        step: 2,
        prepare: async (page) => {
          await openFirstDraftDocument(page);
        },
        target: (page) =>
          page
            .locator('main')
            .getByRole('heading')
            .first()
            .or(page.locator('main').getByRole('button', { name: /Submit for review/i }).first())
            .first(),
      },
    ],
  },
  {
    id: 'staffReceive',
    desktop: [
      {
        step: 1,
        prepare: async (page) => {
          await gotoApp(page, '/app');
        },
        target: (page) =>
          page
            .getByRole('button', { name: /^Receive$/i })
            .or(page.getByRole('link', { name: /^Documents$/i }))
            .or(sidebarLink(page, /^Documents$/i))
            .first(),
      },
      {
        step: 2,
        prepare: async (page) => {
          await gotoApp(page, '/app/invoices/new?type=RECEIPT');
        },
        target: (page) =>
          page
            .locator('main')
            .getByRole('button', { name: /Save|Add line|Submit/i })
            .or(page.locator('main').getByRole('heading').first())
            .first(),
      },
    ],
    mobile: [
      {
        step: 1,
        prepare: async (page) => {
          await gotoApp(page, '/app');
        },
        target: (page) => receiveDockButton(page).first(),
      },
      {
        step: 2,
        prepare: async (page) => {
          await gotoApp(page, '/app/invoices/new?type=RECEIPT');
        },
        target: (page) =>
          page
            .locator('main')
            .getByRole('heading')
            .first()
            .or(page.locator('main').getByRole('button', { name: /Save|Add line/i }).first())
            .first(),
      },
    ],
  },
  {
    id: 'staffSubmit',
    steps: [
      {
        step: 1,
        prepare: async (page) => {
          await openFirstDraftDocument(page);
        },
        target: (page) =>
          page
            .locator('main')
            .getByRole('heading')
            .first()
            .or(page.locator('main a[href*="/app/invoices/"]').first())
            .first(),
      },
      {
        step: 2,
        prepare: async (page) => {
          await openFirstDraftDocument(page);
        },
        target: (page) =>
          page
            .locator('main')
            .getByText(/Lines|Quantity|Batch|Expiry/i)
            .or(page.locator('main').getByRole('heading').first())
            .first(),
      },
      {
        step: 3,
        prepare: async (page) => {
          await ensureStaffSubmitDraft(page);
        },
        target: (page) => page.getByRole('button', { name: /^Send for review$/i }),
      },
    ],
  },
  {
    id: 'staffWriteoff',
    desktop: [
      {
        step: 1,
        prepare: async (page) => {
          await gotoApp(page, '/app');
        },
        target: (page) =>
          page.getByRole('button', { name: /Write-off/i }).or(page.getByRole('link', { name: /Write-off/i })).first(),
      },
      {
        step: 2,
        prepare: async (page) => {
          await gotoApp(page, '/app/write-off');
        },
        target: (page) =>
          page
            .locator('main')
            .getByRole('button', { name: /Write off|Confirm/i })
            .or(page.locator('main').getByRole('heading').first())
            .first(),
      },
    ],
    mobile: [
      {
        step: 1,
        prepare: async (page) => {
          await gotoApp(page, '/app');
        },
        target: (page) => writeOffDockButton(page).first(),
      },
      {
        step: 2,
        prepare: async (page) => {
          await gotoApp(page, '/app/write-off');
        },
        target: (page) =>
          page
            .locator('main')
            .getByRole('button', { name: /Write off|Confirm/i })
            .or(page.locator('main').getByRole('heading').first())
            .first(),
      },
    ],
  },
  {
    id: 'staffStock',
    steps: [
      {
        step: 1,
        prepare: async (page) => {
          await gotoApp(page, '/app');
        },
        target: (page, device) =>
          device === 'desktop'
            ? sidebarLink(page, /^Stock$/i)
            : page.locator('div.fixed.inset-x-0.bottom-0, div.pointer-events-none.fixed.inset-x-0.bottom-0').getByRole('link', {
                name: /Check stock|^Stock$/i,
              }),
      },
      {
        step: 2,
        prepare: async (page) => {
          await gotoApp(page, '/app/expiry');
        },
        target: (page) =>
          page
            .locator('main')
            .getByRole('heading')
            .first()
            .or(page.getByRole('link', { name: /Expiring|Expiry/i }).first())
            .first(),
      },
      {
        step: 3,
        prepare: async (page) => {
          await gotoApp(page, '/app/stock');
          const item = page.locator('main a[href*="/app/stock/"]').first();
          if (await item.count()) await item.click();
        },
        target: (page) =>
          page
            .locator('main')
            .getByText(/Movement|History|On hand|Stock/i)
            .or(page.locator('main').getByRole('heading').first())
            .first(),
      },
    ],
  },
  {
    id: 'staffPending',
    steps: [
      {
        step: 1,
        prepare: async (page) => {
          await openFirstDraftDocument(page);
        },
        target: (page) =>
          page
            .locator('main')
            .getByRole('button', { name: /Create product|New product|from the line/i })
            .or(page.locator('main').getByRole('heading').first())
            .first(),
      },
      {
        step: 2,
        prepare: async (page) => {
          await openFirstDraftDocument(page);
          const create = page.getByRole('button', { name: /Create product|New product/i }).first();
          if (await create.isVisible().catch(() => false)) await create.click();
        },
        target: (page) =>
          page
            .getByLabel(/^Name$/i)
            .or(page.locator('main').getByText(/unit|name/i).first())
            .or(page.locator('main').getByRole('heading').first())
            .first(),
      },
      {
        step: 3,
        prepare: async (page) => {
          await openFirstDraftDocument(page);
          const create = page.getByRole('button', { name: /Create product|New product/i }).first();
          if (await create.isVisible().catch(() => false)) await create.click();
        },
        target: (page) =>
          page
            .getByRole('button', { name: /^Save$|Save changes|Create/i })
            .or(page.locator('main').getByRole('heading').first())
            .first(),
      },
    ],
  },
  {
    id: 'staffQueue',
    steps: [
      {
        step: 1,
        prepare: async (page) => {
          await gotoApp(page, '/app');
        },
        target: (page) =>
          page
            .getByTestId('photo-queue-badge')
            .or(page.locator('header').getByRole('button').filter({ has: page.locator('svg') }).nth(0))
            .first(),
      },
      {
        step: 2,
        prepare: async (page) => {
          await gotoApp(page, '/app/photo-queue');
        },
        target: (page) =>
          page
            .locator('main')
            .getByRole('button', { name: /Upload|Retry|Discard/i })
            .or(page.locator('main').getByRole('heading').first())
            .first(),
      },
      {
        step: 3,
        prepare: async (page) => {
          await gotoApp(page, '/app/invoices');
        },
        target: (page) =>
          page
            .locator('main')
            .getByRole('heading')
            .first()
            .or(page.locator('main a[href*="/app/invoices/"]').first())
            .first(),
      },
    ],
  },
];
