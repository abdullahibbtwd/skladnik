import type { Locator, Page } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
export const OUT_DIR = process.env.GUIDE_OUT_DIR
  ? path.resolve(process.env.GUIDE_OUT_DIR)
  : path.join(ROOT, 'e2e', 'guide-screenshots', 'output');

export type DeviceName = 'desktop' | 'mobile';

export const VIEWPORTS: Record<DeviceName, { width: number; height: number }> = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 390, height: 844 },
};

/** Red outline + numbered badge over the target element (fixed overlay, no layout shift). */
export async function annotate(page: Page, locator: Locator, step: number): Promise<void> {
  await clearAnnotate(page);
  const target = locator.first();
  await target.waitFor({ state: 'visible', timeout: 10_000 });
  await target.scrollIntoViewIfNeeded().catch(() => undefined);
  await page.waitForTimeout(150);
  // Re-resolve after scroll — React may remount the node.
  const handle = await target.elementHandle();
  if (!handle) throw new Error(`Annotate target not found for step ${step}`);
  await page.evaluate(
    ({ el, step: n }) => {
      const rect = el.getBoundingClientRect();
      const root = document.createElement('div');
      root.id = 'guide-annotate-root';
      root.setAttribute('data-guide-step', String(n));

      const outline = document.createElement('div');
      outline.style.cssText = [
        'position:fixed',
        `left:${Math.max(0, rect.left - 3)}px`,
        `top:${Math.max(0, rect.top - 3)}px`,
        `width:${rect.width + 6}px`,
        `height:${rect.height + 6}px`,
        'border:3px solid #ef4444',
        'border-radius:10px',
        'box-shadow:0 0 0 3px rgba(239,68,68,0.22)',
        'z-index:2147483646',
        'pointer-events:none',
        'box-sizing:border-box',
      ].join(';');

      const badge = document.createElement('div');
      const badgeLeft = Math.max(4, rect.left - 10);
      const badgeTop = Math.max(4, rect.top - 10);
      badge.textContent = String(n);
      badge.style.cssText = [
        'position:fixed',
        `left:${badgeLeft}px`,
        `top:${badgeTop}px`,
        'min-width:28px',
        'height:28px',
        'padding:0 6px',
        'border-radius:9999px',
        'background:#ef4444',
        'color:#fff',
        'font:700 13px/28px ui-sans-serif,system-ui,sans-serif',
        'text-align:center',
        'z-index:2147483647',
        'pointer-events:none',
        'box-shadow:0 2px 8px rgba(15,23,42,0.28)',
      ].join(';');

      root.append(outline, badge);
      document.documentElement.appendChild(root);
    },
    { el: handle, step },
  );
}

export async function clearAnnotate(page: Page): Promise<void> {
  await page.evaluate(() => document.getElementById('guide-annotate-root')?.remove());
}

export function shotPath(role: string, task: string, step: number, device: DeviceName): string {
  const stepPad = String(step).padStart(2, '0');
  return path.join(OUT_DIR, `${role.toLowerCase()}_${task}_${stepPad}_${device}.png`);
}

export async function captureAnnotated(
  page: Page,
  locator: Locator,
  opts: { role: string; task: string; step: number; device: DeviceName },
): Promise<string> {
  await annotate(page, locator, opts.step);
  const file = shotPath(opts.role, opts.task, opts.step, opts.device);
  await page.screenshot({ path: file, fullPage: false });
  await clearAnnotate(page);
  return file;
}
