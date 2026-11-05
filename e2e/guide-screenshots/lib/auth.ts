import type { Page } from '@playwright/test';
import { credentialsForRole, type GuideRole } from '../roles';

export async function forceEnglish(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('skladnik.lang', 'en');
    } catch {
      // ignore
    }
  });
}

export async function loginAsRole(page: Page, role: GuideRole): Promise<void> {
  const { email, password } = credentialsForRole(role);
  await forceEnglish(page);
  await page.goto('/login');
  await page.locator('#page-login-email').fill(email);
  await page.locator('#page-login-password').fill(password);
  await page.getByRole('button', { name: /log in to dashboard/i }).click();
  await page.waitForURL(/\/app(\/|$)/, { timeout: 30_000 });
  await page.locator('header').waitFor({ state: 'visible' });
}
