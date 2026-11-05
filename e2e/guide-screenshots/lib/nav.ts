import type { Locator, Page } from '@playwright/test';
import type { DeviceName } from './annotate';
import { VIEWPORTS } from './annotate';

export async function setDevice(page: Page, device: DeviceName): Promise<void> {
  await page.setViewportSize(VIEWPORTS[device]);
  await page.waitForTimeout(200);
}

export async function gotoApp(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await page.waitForLoadState('domcontentloaded');
  await page.locator('header').waitFor({ state: 'visible' });
}

/** Top-bar profile chip (avatar initial). */
export function profileButton(page: Page): Locator {
  return page.locator('header button').filter({ has: page.locator('span.rounded-full.font-semibold') }).first();
}

export async function openProfileMenu(page: Page): Promise<void> {
  await profileButton(page).click();
  await page.getByRole('button', { name: /^Settings$/i }).waitFor({ state: 'visible' });
}

export function sidebarLink(page: Page, name: string | RegExp): Locator {
  return page.locator('aside').getByRole('link', { name });
}

export function settingsTab(page: Page, name: string | RegExp): Locator {
  return page.locator('main nav, div.flex.flex-col nav').getByRole('link', { name }).first();
}

export function photographInvoiceButton(page: Page): Locator {
  return page.locator('aside').getByRole('button', { name: /photograph invoice/i });
}

export function mobileDock(page: Page): Locator {
  return page.locator('div.fixed.inset-x-0.bottom-0 nav, div.pointer-events-none.fixed.inset-x-0.bottom-0 nav');
}

export function scanDockButton(page: Page): Locator {
  return mobileDock(page).getByRole('button', { name: /photograph invoice|scan/i });
}

export function receiveDockButton(page: Page): Locator {
  return mobileDock(page).getByRole('button', { name: /^Receive$/i });
}
