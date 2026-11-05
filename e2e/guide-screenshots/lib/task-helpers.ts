import type { Page } from '@playwright/test';
import { gotoApp } from './nav';

export async function seedTillCart(page: Page): Promise<void> {
  await gotoApp(page, '/app/pos');
  const chargeVisible = page.getByRole('button', { name: /Charge/i });
  if (await chargeVisible.last().isVisible().catch(() => false)) return;

  // Prefer an in-stock browse row so Charge becomes enabled.
  const product = page.locator('main ul li button').first();
  await product.waitFor({ state: 'visible', timeout: 20_000 });
  await product.click();
  await chargeVisible.last().waitFor({ state: 'visible', timeout: 20_000 });
}

export async function openStocktakeSheet(page: Page): Promise<void> {
  await gotoApp(page, '/app/stocktake');
  const open = page.locator('main a[href*="/app/stocktake/"]').first();
  if (await open.count()) {
    await open.click();
    await page.waitForURL(/\/app\/stocktake\/[^/]+/);
    return;
  }
  const start = page.getByRole('button', { name: /Start a count/i }).first();
  if (await start.count()) {
    await start.click();
    const anyway = page.getByRole('button', { name: /Start another/i });
    if (await anyway.isVisible().catch(() => false)) await anyway.click();
    await page.waitForURL(/\/app\/stocktake\/[^/]+/, { timeout: 20_000 }).catch(() => undefined);
  }
}

export async function openFirstDraftDocument(page: Page): Promise<boolean> {
  await gotoApp(page, '/app/invoices');
  const draftRow = page.locator('main a[href*="/app/invoices/"]').filter({ hasText: /Draft|Review/i }).first();
  if (await draftRow.count()) {
    await draftRow.click();
    await page.waitForURL(/\/app\/invoices\/[^/]+/);
    return true;
  }
  const anyDoc = page
    .locator('main a[href*="/app/invoices/"]')
    .filter({ hasNot: page.locator('[href$="/new"]') })
    .first();
  if (await anyDoc.count()) {
    await anyDoc.click();
    await page.waitForURL(/\/app\/invoices\/[^/]+/);
    return true;
  }
  return false;
}

async function filterDocumentsByStatus(page: Page, statusLabel: string): Promise<void> {
  await gotoApp(page, '/app/invoices');
  const statusTrigger = page.locator('main button[aria-haspopup="listbox"]').first();
  await statusTrigger.click();
  await page.getByRole('option', { name: new RegExp(`^${statusLabel}$`, 'i') }).click();
  await page.waitForTimeout(400);
}

async function openFirstDocumentRow(page: Page): Promise<void> {
  const card = page.locator('main ul li button:visible').first();
  const row = page.locator('main tbody tr:visible').first();
  if (await card.isVisible().catch(() => false)) {
    await card.click();
  } else {
    await row.waitFor({ state: 'visible', timeout: 20_000 });
    await row.click();
  }
  await page.waitForURL(/\/app\/invoices\/[^/]+/);
}

/** Open a posted document (needed for Reverse). */
export async function openPostedDocument(page: Page): Promise<void> {
  await filterDocumentsByStatus(page, 'Posted');
  await openFirstDocumentRow(page);
  await page.getByRole('button', { name: /^Reverse$/i }).waitFor({ state: 'visible', timeout: 20_000 });
}

/** Site-manager / owner product modal — Min stock + Save changes. */
export async function openProductMinStockEditor(page: Page): Promise<void> {
  await gotoApp(page, '/app/inventory');
  // Desktop: inline GhostButton. Mobile: ⋯ menu → Minimum stock.
  const inline = page.locator('main').getByRole('button', { name: /Minimum stock|^Edit$/i }).first();
  if (await inline.isVisible().catch(() => false)) {
    await inline.click();
  } else {
    const more = page.locator('main').getByRole('button', { name: /More actions/i }).first();
    await more.waitFor({ state: 'visible', timeout: 20_000 });
    await more.click();
    await page.getByRole('menuitem', { name: /Minimum stock|^Edit$/i }).click();
  }
  await page.getByLabel(/^Min stock$/i).or(page.locator('#product-min')).first().waitFor({ state: 'visible', timeout: 10_000 });
  await page.getByRole('button', { name: /^Save changes$/i }).waitFor({ state: 'visible', timeout: 10_000 });
}

export async function openReportKind(page: Page, kind = 'turnover'): Promise<void> {
  await gotoApp(page, `/app/reports/${kind}`);
  await page.waitForURL(new RegExp(`/app/reports/${kind}`));
  await page.locator('main').getByRole('button', { name: /^CSV$/i }).waitFor({ state: 'visible', timeout: 30_000 });
}

/** Ensure a VAT filing exists so “Mark as submitted” is on the Filings tab. */
export async function openVatFilingsReady(page: Page): Promise<void> {
  await gotoApp(page, '/app/vat');
  const views = page.getByRole('radiogroup', { name: /VAT views/i });
  await views.waitFor({ state: 'visible', timeout: 30_000 });
  await views.scrollIntoViewIfNeeded().catch(() => undefined);

  const filingsTab = page.getByRole('radio', { name: /Filings/i });
  const mark = page.getByRole('button', { name: /^Mark as submitted$/i });

  await filingsTab.click();
  if (await mark.isVisible().catch(() => false)) return;

  // Seed via API (avoids ZIP download side-effects from the Generate button).
  const period =
    (await page.locator('input[type="month"]').inputValue().catch(() => '')) ||
    new Date().toISOString().slice(0, 7);
  await page.evaluate(async (p) => {
    const res = await fetch(`/vat/periods/${p}/filings`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    });
    if (res.ok) return;
    const body = await res.text().catch(() => '');
    // Already generated for this period is fine — Filings will show Mark as submitted.
    if (/Nothing changed since version/i.test(body)) return;
    throw new Error(`VAT generate ${res.status}: ${body}`);
  }, period);

  await page.reload();
  await views.waitFor({ state: 'visible', timeout: 30_000 });
  await filingsTab.click();
  await mark.waitFor({ state: 'visible', timeout: 30_000 });
}

/** Ensure a staff-owned RECEIPT draft with a line exists (required for Send for review). */
export async function ensureStaffSubmitDraft(page: Page): Promise<void> {
  const docId = await page.evaluate(async () => {
    const json = async (path: string, init?: RequestInit) => {
      const res = await fetch(path, {
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
        ...init,
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(`${path} → ${res.status} ${JSON.stringify(body)}`);
      return body;
    };
    const drafts = await json('/documents?status=DRAFT');
    const existing = (drafts.documents ?? []).find((d: { type: string; status: string }) => d.status === 'DRAFT');
    if (existing?.id) return existing.id as string;

    const sites = await json('/sites');
    const siteId = sites.sites?.[0]?.id as string;
    const products = await json('/products');
    const productId = products.products?.[0]?.id as string;
    if (!siteId || !productId) throw new Error('Need a site and product to seed a staff draft');
    const issuedOn = new Date().toISOString().slice(0, 10);
    const created = await json('/documents', {
      method: 'POST',
      body: JSON.stringify({
        type: 'RECEIPT',
        siteId,
        issuedOn,
        direction: 'IN',
        documentNumber: `GUIDE-${Date.now()}`,
      }),
    });
    const id = created.document.id as string;
    await json(`/documents/${id}/lines`, {
      method: 'POST',
      body: JSON.stringify({ productId, quantity: 1, unitPrice: 1 }),
    });
    return id;
  });
  await page.goto(`/app/invoices/${docId}`);
  await page.getByRole('button', { name: /^Send for review$/i }).waitFor({ state: 'visible', timeout: 30_000 });
}

export function writeOffDockButton(page: Page) {
  return page.locator('div.fixed.inset-x-0.bottom-0, div.pointer-events-none.fixed.inset-x-0.bottom-0').getByRole('button', {
    name: /Write-off/i,
  });
}
