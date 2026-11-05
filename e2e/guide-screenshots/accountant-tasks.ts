import type { GuideTask } from './lib/task-types';
import { openFirstDraftDocument, openReportKind, openVatFilingsReady } from './lib/task-helpers';
import { gotoApp, mobileDock, openProfileMenu, settingsTab, sidebarLink } from './lib/nav';

/** Accountant tasks from docs/TENANT_USER_GUIDE.md. */
export const ACCOUNTANT_TASKS: GuideTask[] = [
  {
    id: 'accReports',
    steps: [
      {
        step: 1,
        prepare: async (page) => {
          await gotoApp(page, '/app');
        },
        target: (page, device) =>
          device === 'desktop'
            ? sidebarLink(page, /^Reports$/i)
            : mobileDock(page).getByRole('link', { name: /^Reports$/i }),
      },
      {
        step: 2,
        prepare: async (page) => {
          await openReportKind(page, 'turnover');
        },
        target: (page) =>
          page.locator('main').getByText(/^From$|^To$|^Period$/i).first().or(page.locator('main').getByRole('heading').first()).first(),
      },
      {
        step: 3,
        prepare: async (page) => {
          await openReportKind(page, 'turnover');
        },
        // Export row: CSV / Excel / Print / PDF
        target: (page) =>
          page
            .locator('main')
            .getByRole('button', { name: /^CSV$/i })
            .or(page.locator('main').getByRole('button', { name: /^Excel$/i }))
            .or(page.locator('main').getByRole('button', { name: /^Print/i }))
            .first(),
      },
      {
        step: 4,
        prepare: async (page) => {
          await gotoApp(page, '/app/reports/layouts');
          await page.getByRole('button', { name: /^New layout$/i }).first().waitFor({
            state: 'visible',
            timeout: 20_000,
          });
        },
        target: (page) => page.getByRole('button', { name: /^New layout$/i }).first(),
      },
    ],
  },
  {
    id: 'accArchive',
    steps: [
      {
        step: 1,
        prepare: async (page) => {
          await gotoApp(page, '/app/reports');
          await page.getByRole('link', { name: /Document archive/i }).waitFor({ state: 'visible', timeout: 20_000 });
        },
        target: (page) => page.getByRole('link', { name: /Document archive/i }),
      },
      {
        step: 2,
        prepare: async (page) => {
          await gotoApp(page, '/app/reports/archive');
          // From/To are aria-labels on the period date fields (not visible label text).
          await page.getByLabel(/^From$/i).waitFor({ state: 'visible', timeout: 20_000 });
        },
        target: (page) => page.getByLabel(/^From$/i),
      },
      {
        step: 3,
        prepare: async (page) => {
          await gotoApp(page, '/app/reports/archive');
          await page.getByRole('button', { name: /^Download ZIP$/i }).waitFor({ state: 'visible', timeout: 20_000 });
        },
        target: (page) => page.getByRole('button', { name: /^Download ZIP$/i }),
      },
    ],
  },
  {
    id: 'accVat',
    steps: [
      {
        step: 1,
        prepare: async (page) => {
          await gotoApp(page, '/app');
        },
        target: (page, device) =>
          device === 'desktop'
            ? sidebarLink(page, /^VAT$/i)
            : mobileDock(page).getByRole('link', { name: /^VAT$/i }),
      },
      {
        step: 2,
        prepare: async (page) => {
          await gotoApp(page, '/app/vat');
          const views = page.getByRole('radiogroup', { name: /VAT views/i });
          await views.waitFor({ state: 'visible', timeout: 30_000 });
          await views.scrollIntoViewIfNeeded();
        },
        target: (page) => page.getByRole('radiogroup', { name: /VAT views/i }),
      },
      {
        step: 3,
        prepare: async (page) => {
          await gotoApp(page, '/app/vat');
          const generate = page.getByRole('button', { name: /^Generate files$/i });
          await generate.waitFor({ state: 'visible', timeout: 30_000 });
          await generate.scrollIntoViewIfNeeded();
        },
        target: (page) => page.getByRole('button', { name: /^Generate files$/i }),
      },
      {
        step: 4,
        prepare: async (page) => {
          await openVatFilingsReady(page);
        },
        target: (page) => page.getByRole('button', { name: /^Mark as submitted$/i }),
      },
    ],
  },
  {
    id: 'accAudit',
    steps: [
      {
        step: 1,
        prepare: async (page) => {
          await gotoApp(page, '/app');
        },
        target: (page, device) =>
          device === 'desktop'
            ? sidebarLink(page, /^Audit$/i)
            : mobileDock(page).getByRole('link', { name: /^Audit$/i }),
      },
      {
        step: 2,
        prepare: async (page) => {
          await gotoApp(page, '/app/audit');
        },
        target: (page) =>
          page
            .locator('main')
            .getByText(/site|month|period/i)
            .or(page.locator('main').getByRole('heading').first())
            .first(),
      },
      {
        step: 3,
        prepare: async (page) => {
          await gotoApp(page, '/app/audit');
        },
        target: (page) =>
          page
            .getByRole('button', { name: /Generate XML|^Generate$/i })
            .or(page.locator('main').getByRole('heading').first())
            .first(),
      },
      {
        step: 4,
        prepare: async (page) => {
          await gotoApp(page, '/app/audit');
        },
        target: (page) =>
          page
            .getByRole('radio', { name: /Orders|Refunds|Versions|Archive/i })
            .or(page.getByRole('tab', { name: /Orders|Refunds|Versions|Archive/i }))
            .or(page.getByText(/Orders|Refunds|Versions|Archive/i).first())
            .first(),
      },
    ],
  },
  {
    id: 'accSales',
    steps: [
      {
        step: 1,
        prepare: async (page, device) => {
          await gotoApp(page, '/app');
          if (device === 'mobile') await openProfileMenu(page);
        },
        target: (page, device) =>
          device === 'desktop'
            ? sidebarLink(page, /^Sales$/i)
            : page.getByRole('button', { name: /^Sales$/i }).or(sidebarLink(page, /^Sales$/i)).first(),
      },
      {
        step: 2,
        prepare: async (page) => {
          await gotoApp(page, '/app/sales');
          const receipt = page.locator('main a[href*="/app/sales/"]').first();
          if (await receipt.count()) await receipt.click();
        },
        target: (page) =>
          page
            .locator('main')
            .getByRole('heading')
            .first()
            .or(page.locator('main').getByText(/receipt|sale|day/i).first())
            .first(),
      },
      {
        step: 3,
        prepare: async (page) => {
          await gotoApp(page, '/app/sales/margins');
        },
        target: (page) =>
          page
            .getByRole('heading', { name: /Margins/i })
            .or(page.locator('main').getByRole('heading').first())
            .first(),
      },
    ],
  },
  {
    id: 'accDocs',
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
          await gotoApp(page, '/app/settings/activity');
        },
        target: (page) =>
          settingsTab(page, /Activity/i)
            .or(page.locator('main').getByRole('heading').first())
            .or(page.locator('main').getByText(/Activity/i).first())
            .first(),
      },
    ],
  },
];
