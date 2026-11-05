import type { Page } from '@playwright/test';
import type { DeviceName } from './lib/annotate';
import {
  gotoApp,
  mobileDock,
  openProfileMenu,
  photographInvoiceButton,
  receiveDockButton,
  scanDockButton,
  settingsTab,
  sidebarLink,
} from './lib/nav';
import { openFirstDraftDocument, openStocktakeSheet, seedTillCart } from './lib/task-helpers';
import type { GuideTask } from './lib/task-types';

export type { GuideStep, GuideTask } from './lib/task-types';
export { stepsForTask } from './lib/task-types';

async function openSettingsShell(page: Page, device: DeviceName): Promise<void> {
  await gotoApp(page, '/app');
  if (device === 'mobile') await openProfileMenu(page);
}

async function ensureSettings(page: Page): Promise<void> {
  await gotoApp(page, '/app/settings');
}

async function openSites(page: Page): Promise<void> {
  await gotoApp(page, '/app/settings/sites');
  await page.getByRole('heading', { name: /locations|sites/i }).or(page.getByText(/Add site/i)).first().waitFor({ state: 'visible' });
}

async function openUsers(page: Page): Promise<void> {
  await gotoApp(page, '/app/settings/users');
  await page.getByRole('button', { name: /invite/i }).first().waitFor({ state: 'visible' });
}

/** Owner tasks from docs/TENANT_USER_GUIDE.md (and help-structure OWNER list). */
export const OWNER_TASKS: GuideTask[] = [
  {
    id: 'ownerSites',
    steps: [
      {
        step: 1,
        prepare: async (page, device) => {
          await openSettingsShell(page, device);
        },
        target: (page, device) =>
          device === 'desktop'
            ? sidebarLink(page, /^Settings$/i)
            : page.getByRole('button', { name: /^Settings$/i }),
      },
      {
        step: 2,
        prepare: async (page) => {
          await openSites(page);
        },
        target: (page) => page.getByRole('button', { name: /Add site/i }).first(),
      },
      {
        step: 3,
        prepare: async (page) => {
          await openSites(page);
          await page.getByRole('button', { name: /Add site/i }).first().click();
          await page.getByLabel(/^Name$/i).or(page.locator('#site-name, input[name="name"]')).first().waitFor({ state: 'visible' });
        },
        target: (page) =>
          page
            .locator('[role="dialog"], form')
            .filter({ has: page.getByText(/New site|Edit site|site type|Name/i) })
            .first(),
      },
      {
        step: 4,
        prepare: async (page, device) => {
          await openSites(page);
          if (device === 'mobile') {
            const more = page.getByRole('button', { name: /More actions/i }).first();
            if (await more.count()) await more.click();
          }
        },
        target: (page, device) =>
          device === 'mobile'
            ? page.getByRole('menuitem', { name: /Deactivate/i }).or(page.getByRole('button', { name: /^Deactivate$/i })).first()
            : page.getByRole('button', { name: /^Deactivate$/i }).first(),
      },
    ],
  },
  {
    id: 'ownerInvite',
    steps: [
      {
        step: 1,
        prepare: async (page) => {
          await ensureSettings(page);
        },
        target: (page) => settingsTab(page, /^Users$/i),
      },
      {
        step: 2,
        prepare: async (page) => {
          await openUsers(page);
        },
        target: (page) => page.getByRole('button', { name: /Invite/i }).first(),
      },
      {
        step: 3,
        prepare: async (page) => {
          await openUsers(page);
          await page.getByRole('button', { name: /Invite/i }).first().click();
          await page.getByLabel(/email/i).first().waitFor({ state: 'visible' });
        },
        target: (page) =>
          page.locator('[role="dialog"], form').filter({ has: page.getByLabel(/email/i) }).first(),
      },
      {
        step: 4,
        prepare: async (page) => {
          await openUsers(page);
          await page.getByRole('button', { name: /Invite/i }).first().click();
          await page.getByRole('button', { name: /Send invite/i }).waitFor({ state: 'visible' });
        },
        target: (page) => page.getByRole('button', { name: /Send invite/i }),
      },
      {
        step: 5,
        prepare: async (page) => {
          await openUsers(page);
        },
        target: (page) =>
          page.getByText(/Pending invites/i).or(page.getByText(/No pending invites/i)).first(),
      },
    ],
  },
  {
    id: 'ownerReceive',
    desktop: [
      {
        step: 1,
        prepare: async (page) => {
          await gotoApp(page, '/app');
        },
        target: (page) =>
          photographInvoiceButton(page).or(sidebarLink(page, /^Documents$/i)).first(),
      },
      {
        step: 2,
        prepare: async (page) => {
          await gotoApp(page, '/app/invoices');
          const neu = page.getByRole('button', { name: /New document/i }).first();
          if (await neu.count()) await neu.click();
          else await gotoApp(page, '/app/invoices/new');
        },
        target: (page) =>
          page
            .getByRole('button', { name: /photograph|camera|choose|attach|photo/i })
            .or(page.getByText(/Photograph invoice|Choose the camera|photo from this device/i))
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
    id: 'ownerPost',
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
            .getByText(/Lines|Quantity|Batch|Expiry|Products/i)
            .first()
            .or(page.locator('main').getByRole('heading').first())
            .first(),
      },
      {
        step: 3,
        prepare: async (page) => {
          await openFirstDraftDocument(page);
        },
        target: (page) =>
          page
            .locator('main')
            .getByRole('button', { name: /Post to stock|Submit for review|^Post$/i })
            .or(page.locator('main').getByRole('button', { name: /New document/i }))
            .first(),
      },
      {
        step: 4,
        prepare: async (page) => {
          await openFirstDraftDocument(page);
        },
        target: (page) =>
          page
            .locator('main')
            .getByRole('button', { name: /Cancel draft|Cancel document/i })
            .or(page.locator('main').getByRole('button', { name: /New document/i }))
            .first(),
      },
    ],
  },
  {
    id: 'ownerProducts',
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
          await gotoApp(page, '/app/inventory');
        },
        target: (page) => page.getByRole('button', { name: /Add product/i }).first(),
      },
      {
        step: 3,
        prepare: async (page) => {
          await gotoApp(page, '/app/inventory');
        },
        target: (page) =>
          page
            .getByText(/Pending review/i)
            .or(page.getByRole('button', { name: /^Approve$/i }).first())
            .first(),
      },
      {
        step: 4,
        prepare: async (page, device) => {
          await gotoApp(page, '/app/inventory');
          if (device === 'mobile') {
            const more = page.getByRole('button', { name: /More actions/i }).first();
            if (await more.count()) await more.click();
          }
        },
        target: (page) =>
          page
            .getByRole('menuitem', { name: /Archive/i })
            .or(page.getByRole('button', { name: /^Archive$/i }))
            .or(page.getByRole('button', { name: /More actions/i }))
            .or(page.locator('main').getByRole('button', { name: /Add product/i }))
            .first(),
      },
    ],
  },
  {
    id: 'ownerTransfer',
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
            .getByText(/^From$|^To$/i)
            .first()
            .or(page.locator('main').getByText(/Where is it going/i))
            .first(),
      },
      {
        step: 3,
        prepare: async (page) => {
          await gotoApp(page, '/app/transfer');
        },
        target: (page) =>
          page
            .getByText(/What are you sending|Search|catalog/i)
            .first()
            .or(page.locator('main input[type="search"]').first())
            .first(),
      },
      {
        step: 4,
        prepare: async (page) => {
          await gotoApp(page, '/app/transfer');
        },
        target: (page) => page.getByRole('button', { name: /^Transfer$/i }).first(),
      },
    ],
  },
  {
    id: 'ownerStocktake',
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
            .getByText(/Count sheet|Counted|Books|progress/i)
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
            .getByRole('button', { name: /uncounted|Set .* to 0/i })
            .or(page.locator('main').getByText(/not counted|uncounted|Every line is counted/i))
            .or(page.locator('main').getByRole('heading').first())
            .first(),
      },
      {
        step: 4,
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
    id: 'ownerTill',
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
          page
            .getByRole('button', { name: /^Till$/i })
            .or(mobileDock(page).getByRole('button', { name: /Till|pos/i }))
            .first(),
      },
      {
        step: 2,
        prepare: async (page) => {
          await seedTillCart(page);
        },
        // Sticky mobile Charge sits last in the DOM (desktop Charge is hidden).
        target: (page) => page.getByRole('button', { name: /Charge/i }).last(),
      },
    ],
  },
  {
    id: 'ownerReports',
    steps: [
      {
        step: 1,
        prepare: async (page) => {
          await gotoApp(page, '/app/reports');
        },
        target: (page) =>
          page
            .getByRole('link', { name: /turnover|stock value|write-off/i })
            .first()
            .or(page.locator('main a[href*="/app/reports/"]').first())
            .first(),
      },
      {
        step: 2,
        prepare: async (page) => {
          await gotoApp(page, '/app/reports');
          const first = page.locator('main a[href*="/app/reports/"]').first();
          if (await first.count()) await first.click();
        },
        target: (page) =>
          page
            .getByText(/^Period$/i)
            .or(page.locator('main').getByText(/Period|From|To|date/i).first())
            .first(),
      },
      {
        step: 3,
        prepare: async (page) => {
          await gotoApp(page, '/app/reports');
          const first = page.locator('main a[href*="/app/reports/"]').first();
          if (await first.count()) await first.click();
        },
        target: (page) =>
          page
            .getByRole('button', { name: /^CSV$|^Excel$|Print \/ PDF/i })
            .first(),
      },
      {
        step: 4,
        prepare: async (page) => {
          await gotoApp(page, '/app/reports');
        },
        target: (page) =>
          page
            .getByRole('link', { name: /CSV layouts|layouts/i })
            .or(page.getByText(/CSV layouts/i))
            .first(),
      },
    ],
  },
  {
    id: 'ownerVat',
    steps: [
      {
        step: 1,
        prepare: async (page, device) => {
          await gotoApp(page, '/app');
          if (device === 'mobile') await openProfileMenu(page);
        },
        target: (page, device) =>
          device === 'desktop' ? sidebarLink(page, /^VAT$/i) : page.getByRole('button', { name: /^VAT$/i }),
      },
      {
        step: 2,
        prepare: async (page) => {
          await gotoApp(page, '/app/vat');
        },
        target: (page) =>
          page
            .getByRole('tablist')
            .or(page.getByText(/Return|Purchases|Sales|Filings/i).first())
            .first(),
      },
      {
        step: 3,
        prepare: async (page) => {
          await gotoApp(page, '/app/vat');
        },
        target: (page) =>
          page.getByRole('button', { name: /Generate|NRA|download/i }).first(),
      },
      {
        step: 4,
        prepare: async (page) => {
          await gotoApp(page, '/app/vat');
        },
        target: (page) =>
          page
            .getByRole('button', { name: /settings|VAT settings|Company/i })
            .or(page.getByRole('link', { name: /company/i }))
            .first(),
      },
    ],
  },
  {
    id: 'ownerOpening',
    steps: [
      {
        step: 1,
        prepare: async (page, device) => {
          if (device === 'mobile') {
            await gotoApp(page, '/app');
            await openProfileMenu(page);
          } else {
            await gotoApp(page, '/app/stock');
          }
        },
        target: (page) =>
          page.getByRole('button', { name: /Opening stock/i }).or(page.getByRole('link', { name: /Opening stock/i })).first(),
      },
      {
        step: 2,
        prepare: async (page) => {
          await gotoApp(page, '/app/opening-stock');
        },
        target: (page) =>
          page
            .locator('main input[type="search"]')
            .or(page.getByText(/Items on hand|Search the catalog/i))
            .first(),
      },
      {
        step: 3,
        prepare: async (page) => {
          await gotoApp(page, '/app/opening-stock');
        },
        target: (page) => page.getByRole('button', { name: /Post opening stock/i }).first(),
      },
    ],
  },
  {
    id: 'ownerSubscription',
    steps: [
      {
        step: 1,
        prepare: async (page) => {
          await ensureSettings(page);
        },
        target: (page) => settingsTab(page, /^Subscription$/i),
      },
      {
        step: 2,
        prepare: async (page) => {
          await gotoApp(page, '/app/settings/subscription');
        },
        target: (page) =>
          page.getByLabel(/Activation code/i).or(page.getByPlaceholder(/XXXX/i)).first(),
      },
      {
        step: 3,
        prepare: async (page) => {
          await gotoApp(page, '/app/settings/subscription');
          // Preview dialog only appears after a valid code; highlight Activate as the confirm path.
        },
        target: (page) =>
          page
            .getByText(/Confirm activation/i)
            .or(page.getByRole('button', { name: /^Activate$/i }))
            .first(),
      },
      {
        step: 4,
        prepare: async (page) => {
          await gotoApp(page, '/app/settings/subscription');
        },
        target: (page) => page.getByRole('button', { name: /^Activate$|Confirm activate/i }).first(),
      },
    ],
  },
];
