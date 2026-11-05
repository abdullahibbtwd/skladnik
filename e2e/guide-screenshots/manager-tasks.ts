import type { GuideTask } from './lib/task-types';
import {
  openFirstDraftDocument,
  openPostedDocument,
  openProductMinStockEditor,
  openReportKind,
  openStocktakeSheet,
  seedTillCart,
  writeOffDockButton,
} from './lib/task-helpers';
import { gotoApp, mobileDock, openProfileMenu, photographInvoiceButton, receiveDockButton, scanDockButton, sidebarLink } from './lib/nav';

/** Site manager tasks from docs/TENANT_USER_GUIDE.md. */
export const SITE_MANAGER_TASKS: GuideTask[] = [
  {
    id: 'mgrReceive',
    desktop: [
      {
        step: 1,
        prepare: async (page) => {
          await gotoApp(page, '/app');
        },
        target: (page) => photographInvoiceButton(page).or(sidebarLink(page, /^Documents$/i)).first(),
      },
      {
        step: 2,
        prepare: async (page) => {
          await openFirstDraftDocument(page);
        },
        target: (page) =>
          page
            .locator('main')
            .getByRole('button', { name: /Post to stock|Submit for review|^Post$/i })
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
        target: (page) => scanDockButton(page).or(receiveDockButton(page)).first(),
      },
      {
        step: 2,
        prepare: async (page) => {
          await gotoApp(page, '/app/invoices');
        },
        target: (page) =>
          page
            .locator('main')
            .getByRole('heading')
            .first()
            .or(page.locator('main').getByRole('button', { name: /New document|Receive/i }).first())
            .first(),
      },
    ],
  },
  {
    id: 'mgrPost',
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
            .getByRole('button', { name: /Post to stock|^Post$/i })
            .or(page.locator('main').getByRole('button', { name: /New document/i }))
            .first(),
      },
      {
        step: 3,
        prepare: async (page) => {
          await openPostedDocument(page);
        },
        target: (page) => page.getByRole('button', { name: /^Reverse$/i }),
      },
    ],
  },
  {
    id: 'mgrWriteoff',
    desktop: [
      {
        step: 1,
        prepare: async (page) => {
          await gotoApp(page, '/app');
        },
        target: (page) =>
          page
            .getByRole('button', { name: /Write-off/i })
            .or(page.getByRole('link', { name: /Write-off/i }))
            .first(),
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
    id: 'mgrTransfer',
    steps: [
      {
        step: 1,
        prepare: async (page, device) => {
          await gotoApp(page, '/app');
          if (device === 'mobile') await openProfileMenu(page);
        },
        target: (page, device) =>
          device === 'desktop' ? sidebarLink(page, /^Transfer$/i) : page.getByRole('button', { name: /^Transfer$/i }),
      },
      {
        step: 2,
        prepare: async (page) => {
          await gotoApp(page, '/app/transfer');
        },
        target: (page) =>
          page
            .getByText(/^From$|^To$|Where is it going/i)
            .first()
            .or(page.locator('main').getByRole('heading').first())
            .first(),
      },
      {
        step: 3,
        prepare: async (page) => {
          await gotoApp(page, '/app/transfer');
        },
        target: (page) => page.getByRole('button', { name: /^Transfer$/i }).first(),
      },
    ],
  },
  {
    id: 'mgrStocktake',
    steps: [
      {
        step: 1,
        prepare: async (page) => {
          await gotoApp(page, '/app/stocktake');
        },
        target: (page) => page.getByRole('button', { name: /Start a count/i }).first(),
      },
      {
        step: 2,
        prepare: async (page) => {
          await openStocktakeSheet(page);
        },
        target: (page) =>
          page
            .locator('main')
            .getByText(/Count sheet|Counted|Books/i)
            .or(page.locator('main').getByRole('heading').first())
            .first(),
      },
      {
        step: 3,
        prepare: async (page) => {
          await openStocktakeSheet(page);
        },
        target: (page) =>
          page
            .locator('main')
            .getByRole('button', { name: /Post adjustments|Discard this count/i })
            .or(page.getByRole('button', { name: /Start a count/i }))
            .first(),
      },
    ],
  },
  {
    id: 'mgrTill',
    desktop: [
      {
        step: 1,
        prepare: async (page) => {
          await gotoApp(page, '/app');
        },
        target: (page) => sidebarLink(page, /^Till$/i),
      },
      {
        step: 2,
        prepare: async (page) => {
          await seedTillCart(page);
        },
        target: (page) => page.getByRole('button', { name: /Charge/i }).last(),
      },
    ],
    mobile: [
      {
        step: 1,
        prepare: async (page) => {
          await gotoApp(page, '/app');
          await openProfileMenu(page);
        },
        target: (page) =>
          page.getByRole('button', { name: /^Till$/i }).or(mobileDock(page).getByRole('button', { name: /Till/i })).first(),
      },
      {
        step: 2,
        prepare: async (page) => {
          await seedTillCart(page);
        },
        target: (page) => page.getByRole('button', { name: /Charge/i }).last(),
      },
    ],
  },
  {
    id: 'mgrMinstock',
    steps: [
      {
        step: 1,
        prepare: async (page, device) => {
          await gotoApp(page, '/app');
          if (device === 'mobile') await openProfileMenu(page);
        },
        target: (page, device) =>
          device === 'desktop' ? sidebarLink(page, /^Products$/i) : page.getByRole('button', { name: /^Products$/i }),
      },
      {
        step: 2,
        prepare: async (page) => {
          await openProductMinStockEditor(page);
        },
        target: (page) => page.getByLabel(/^Min stock$/i).or(page.locator('#product-min')).first(),
      },
      {
        step: 3,
        prepare: async (page) => {
          await openProductMinStockEditor(page);
        },
        target: (page) => page.getByRole('button', { name: /^Save changes$/i }),
      },
    ],
  },
  {
    id: 'mgrRecipes',
    steps: [
      {
        step: 1,
        prepare: async (page, device) => {
          await gotoApp(page, '/app');
          if (device === 'mobile') await openProfileMenu(page);
        },
        target: (page, device) =>
          device === 'desktop' ? sidebarLink(page, /^Recipes$/i) : page.getByRole('button', { name: /^Recipes$/i }),
      },
      {
        step: 2,
        prepare: async (page) => {
          await gotoApp(page, '/app/recipes');
          await page.getByRole('button', { name: /^New recipe$/i }).first().waitFor({ state: 'visible', timeout: 20_000 });
        },
        target: (page) => page.getByRole('button', { name: /^New recipe$/i }).first(),
      },
      {
        step: 3,
        prepare: async (page) => {
          await gotoApp(page, '/app/recipes');
          const existing = page.locator('main a[href*="/app/recipes/"]').filter({ hasNot: page.locator('[href$="/new"]') }).first();
          if (await existing.count()) {
            await existing.click();
            await page.getByRole('button', { name: /^Save recipe$/i }).waitFor({ state: 'visible', timeout: 20_000 });
          } else {
            await gotoApp(page, '/app/recipes/new');
            await page.getByRole('button', { name: /Create and add ingredients/i }).waitFor({ state: 'visible', timeout: 20_000 });
          }
        },
        target: (page) =>
          page
            .getByRole('button', { name: /^Save recipe$/i })
            .or(page.getByRole('button', { name: /Create and add ingredients/i }))
            .first(),
      },
    ],
  },
  {
    id: 'mgrReports',
    steps: [
      {
        step: 1,
        prepare: async (page, device) => {
          await gotoApp(page, '/app');
          if (device === 'mobile') await openProfileMenu(page);
        },
        target: (page, device) =>
          device === 'desktop' ? sidebarLink(page, /^Reports$/i) : page.getByRole('button', { name: /^Reports$/i }),
      },
      {
        step: 2,
        prepare: async (page) => {
          await gotoApp(page, '/app/sales/margins');
        },
        target: (page) =>
          page
            .getByRole('heading', { name: /Margins|Sales/i })
            .or(page.locator('main').getByRole('heading').first())
            .first(),
      },
      {
        step: 3,
        prepare: async (page) => {
          await openReportKind(page, 'turnover');
        },
        target: (page) => page.locator('main').getByRole('button', { name: /^CSV$/i }),
      },
    ],
  },
];
