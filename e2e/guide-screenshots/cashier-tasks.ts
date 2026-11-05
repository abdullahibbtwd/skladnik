import type { GuideTask } from './lib/task-types';
import { seedTillCart } from './lib/task-helpers';
import { gotoApp, mobileDock, sidebarLink } from './lib/nav';

/** Cashier tasks from docs/TENANT_USER_GUIDE.md. */
export const CASHIER_TASKS: GuideTask[] = [
  {
    id: 'cashTill',
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
        target: (page) => page.locator('button:visible').filter({ hasText: /Charge/ }).last(),
      },
    ],
    mobile: [
      {
        step: 1,
        prepare: async (page) => {
          await gotoApp(page, '/app');
        },
        target: (page) =>
          mobileDock(page)
            .getByRole('button', { name: /^Till$/i })
            .or(page.getByRole('button', { name: /^Till$/i }))
            .first(),
      },
      {
        step: 2,
        prepare: async (page) => {
          await seedTillCart(page);
        },
        target: (page) => page.locator('button:visible').filter({ hasText: /Charge/ }).last(),
      },
    ],
  },
  {
    id: 'cashSales',
    steps: [
      {
        step: 1,
        prepare: async (page, device) => {
          await gotoApp(page, '/app');
          if (device === 'mobile') {
            // Cashier dock includes Sales.
          }
        },
        target: (page, device) =>
          device === 'desktop'
            ? sidebarLink(page, /^Sales$/i)
            : mobileDock(page).getByRole('link', { name: /^Sales$/i }),
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
    ],
  },
  {
    id: 'cashStock',
    steps: [
      {
        step: 1,
        prepare: async (page) => {
          await gotoApp(page, '/app');
        },
        target: (page, device) =>
          device === 'desktop'
            ? sidebarLink(page, /^Stock$/i).or(sidebarLink(page, /^Expiry$/i)).first()
            : mobileDock(page)
                .getByRole('link', { name: /^Stock$|^Expiring$/i })
                .first(),
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
            .or(page.locator('main').getByText(/expir|batch|quantity/i).first())
            .first(),
      },
    ],
  },
];
